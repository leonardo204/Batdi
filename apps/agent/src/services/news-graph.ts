/**
 * NewsGraph 서비스 (news intent — KBO 뉴스 리스트 카드 실데이터 배선, P3-W7 7.5 ADR-048)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-048, §3.5,
 *       CLAUDE.md "팩트(수치)는 DB → DataBinder → 템플릿 참조만".
 *
 * 책임:
 *  - 크롤러(api/news 모듈)가 적재한 `cache_news`(Prisma CacheNews)에서 최신 뉴스 5건을
 *    한 줄씩 미리 포맷된 문자열(line)로 변환해 news_compact 템플릿 슬롯(rows.N.line)에 싣는다.
 *  - 포맷 로직(formatNewsLine)은 **순수 함수**로 분리해 DB 없이 단위테스트한다.
 *  - DB 접근(fetchNewsData)은 getPrisma() best-effort — DATABASE_URL 없음/연결 실패/쿼리
 *    에러/빈 결과 시 null 을 반환하고 절대 throw 하지 않는다(emit 폴백 텍스트 카드).
 *
 * stats-graph.ts(formatStandingsLine + fetchStandings)와 평행 패턴.
 * ⚠️ 뉴스는 LLM 감정 리액션을 생성하지 않으므로 news_compact 에는 /reaction 슬롯이 없다(L1).
 */
import { getPrisma } from '../utils/prisma';

/** 뉴스 한 줄 (미리 포맷된 문자열 — 카드의 단일 Text 노드 1개에 대응) */
export interface NewsRow {
  line: string;
}

/** 뉴스 데이터 (news_compact 템플릿 bind 경로 `rows.N.line` 과 1:1) */
export interface NewsData {
  rows: NewsRow[];
}

/**
 * cache_news 행에서 NewsGraph 가 읽는 필드의 최소 구조(읽기 전용).
 * Prisma CacheNews 모델의 부분집합이라 prisma.cacheNews 결과를 그대로 받는다.
 */
export interface CacheNewsRow {
  title: string | null;
  summary: string | null;
  source: string | null;
}

/** 뉴스 줄 개수 (news_compact rows.0.line..rows.4.line 과 일치 — 최신 5건) */
const NEWS_ROW_COUNT = 5;

/**
 * cache_news 1행 → 뉴스 카드 한 줄 문자열(순수 함수).
 *
 * 포맷: `${summary ?? title} — ${source ?? '뉴스'}`
 *   예) "한화 선발진 호투로 위닝시리즈 — 스포츠경향"
 *
 *  - summary(요약) 우선, 없으면 title. 둘 다 없으면 빈 문자열 폴백("뉴스").
 *  - 출처(source) 없으면 '뉴스'. 수치는 사전 포맷 문자열 안에만 존재(LLM 미생성).
 *  - 줄이 과도하게 길면 적당히 자른다(가독·노드 안정).
 */
export function formatNewsLine(article: CacheNewsRow): string {
  const headline = (article.summary ?? article.title ?? '').trim();
  const safeHeadline = headline !== '' ? headline : '뉴스';
  const source = (article.source ?? '').trim();
  const safeSource = source !== '' ? source : '뉴스';
  const line = `${safeHeadline} — ${safeSource}`;
  // 너무 길면 카드 가독을 위해 잘라낸다(말줄임).
  const MAX = 80;
  return line.length > MAX ? `${line.slice(0, MAX - 1)}…` : line;
}

/**
 * news 카드용 실데이터를 DB(cache_news)에서 읽어 NewsData 로 반환한다.
 *
 * best-effort: getPrisma() undefined(테스트/DATABASE_URL 없음) 또는 쿼리 실패/빈 결과 시 null.
 * 절대 throw 하지 않는다(호출부 emit 이 null → 폴백 텍스트 카드 처리).
 *
 *  - 팀 뉴스(teamId) + 일반 뉴스(teamId=null) 를 함께(OR)
 *  - 만료 안 됨(expiresAt > now), publishedAt desc, take 5 → 각 행 formatNewsLine
 *  - 빈 결과 → null
 *
 * @param teamId 팀 코드(undefined 면 일반 뉴스만)
 * @returns NewsData | null
 */
export async function fetchNewsData(
  teamId?: string,
): Promise<NewsData | null> {
  const prisma = getPrisma();
  if (!prisma) {
    return null; // DB 비활성(테스트/DATABASE_URL 없음) → best-effort null
  }

  const now = new Date();
  // teamId 있으면 팀 뉴스 + 일반(null), 없으면 일반(null)만.
  const teamFilter: Array<{ teamId: string | null }> =
    teamId !== undefined && teamId.trim() !== ''
      ? [{ teamId }, { teamId: null }]
      : [{ teamId: null }];

  try {
    const rows = (await prisma.cacheNews.findMany({
      where: {
        OR: teamFilter,
        expiresAt: { gt: now },
      },
      orderBy: { publishedAt: 'desc' },
      take: NEWS_ROW_COUNT,
    })) as CacheNewsRow[];

    if (rows.length === 0) {
      return null; // 적재 전/만료/없음 → 폴백
    }

    // news_compact 는 rows.0.line..rows.4.line 5슬롯을 전부 바인딩한다(validateBindings).
    // 적재가 5건 미만이어도 카드가 렌더되도록 빈 줄(공백)로 패딩해 5건을 채운다.
    const lines = rows.map((r) => ({ line: formatNewsLine(r) }));
    while (lines.length < NEWS_ROW_COUNT) {
      lines.push({ line: ' ' });
    }
    return { rows: lines };
  } catch {
    // 연결/쿼리 실패 → best-effort null (그래프 실행 막지 않음, emit 폴백)
    return null;
  }
}
