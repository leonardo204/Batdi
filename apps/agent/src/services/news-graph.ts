/**
 * NewsGraph 서비스 v2 (news intent — Gemini grounding 실시간 뉴스 + cache_news TTL, ADR-058)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-058/ADR-048, §3.5,
 *       CLAUDE.md "팩트(수치)는 DB → DataBinder → 템플릿 참조만".
 *
 * 책임(ADR-058 — RSS 폴백을 grounding 우선으로 교체):
 *  1) queryKey 로 `cache_news`(미만료) 조회 → HIT 면 rows 구성해 즉시 반환(LLM 0회).
 *  2) MISS/stale → searchNews(query)(Gemini googleSearch grounding) 실시간 검색.
 *     결과 있으면 cache_news 에 저장(queryKey·source='gemini-grounding'·TTL 30분) 후 rows 반환.
 *     null(키 없음/실패/빈)이면 기존처럼 null 반환(EmitA2UI 폴백 텍스트 카드).
 *  - 포맷 로직(formatNewsLine)은 **순수 함수**로 분리해 DB 없이 단위테스트한다.
 *  - DB 접근(getPrisma)은 best-effort — DATABASE_URL 없음/연결 실패/쿼리 에러 시 검색은
 *    계속 시도하고, 캐시 조회/저장만 건너뛴다(절대 throw 금지).
 *
 * ⚠️ grounding 응답은 비결정이라 L0 Envelope 캐시 불가 → cache_news(queryKey TTL)로 대체.
 * ⚠️ 뉴스는 LLM 감정 리액션을 생성하지 않으므로 news_compact 에는 /reaction 슬롯이 없다(L1).
 */
import { getPrisma } from '../utils/prisma';
import { searchNews, type NewsItem, type NewsQuery } from './news-search';

/** grounding 저장 시 출처 식별자(cache_news.source). */
const GROUNDING_SOURCE = 'gemini-grounding';
/** grounding 캐시 TTL(30분 — 뉴스는 비교적 빠르게 갱신). */
const NEWS_CACHE_TTL_MS = 30 * 60 * 1000;

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
  title?: string | null;
  summary?: string | null;
  source?: string | null;
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
 * CacheNewsRow/NewsItem 줄 목록을 news_compact 5슬롯(rows.0..rows.4)으로 패딩한다.
 * 5건 미만이면 빈 줄(공백)로 채워 카드 바인딩(validateBindings)이 통과하게 한다.
 */
function toNewsRows(lines: string[]): NewsData {
  const rows = lines.slice(0, NEWS_ROW_COUNT).map((line) => ({ line }));
  while (rows.length < NEWS_ROW_COUNT) {
    rows.push({ line: ' ' });
  }
  return { rows };
}

/**
 * queryKey 로 cache_news(미만료) 를 조회해 NewsData 로 구성한다. HIT 없으면 null.
 * best-effort — getPrisma 없음/쿼리 실패 시 null(throw 금지).
 */
async function readCachedNews(queryKey: string): Promise<NewsData | null> {
  const prisma = getPrisma();
  if (!prisma) {
    return null;
  }
  try {
    const rows = (await prisma.cacheNews.findMany({
      where: { queryKey, expiresAt: { gt: new Date() } },
      orderBy: { publishedAt: 'desc' },
      take: NEWS_ROW_COUNT,
    })) as CacheNewsRow[];
    if (rows.length === 0) {
      return null;
    }
    return toNewsRows(rows.map((r) => formatNewsLine(r)));
  } catch {
    return null; // 연결/쿼리 실패 → MISS 취급(검색 진행).
  }
}

/**
 * grounding 검색 결과(NewsItem[])를 cache_news 에 저장한다(best-effort, TTL 30분).
 * url 충돌(@unique)·DB 비활성·쿼리 실패는 모두 무시(응답은 이미 진행). skipDuplicates 로
 * 같은 url 중복 적재를 방지한다(같은 기사가 여러 질의에서 나올 수 있음).
 */
async function writeCachedNews(
  queryKey: string,
  teamId: string | null,
  items: NewsItem[],
): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) {
    return;
  }
  const now = Date.now();
  const expiresAt = new Date(now + NEWS_CACHE_TTL_MS);
  try {
    await prisma.cacheNews.createMany({
      data: items.map((it, i) => ({
        queryKey,
        teamId,
        title: it.title.slice(0, 255),
        // url 은 @unique VARCHAR(512). grounding redirect URL 없으면 충돌 회피용 합성 키.
        url: (it.url ?? `grounding:${queryKey}:${now}:${i}`).slice(0, 512),
        summary: it.summary ?? it.title,
        source: GROUNDING_SOURCE,
        // publishedAt 은 검색 시각으로(정렬용). grounding 은 발행시각을 안 줌.
        publishedAt: new Date(now - i), // 순서 보존(앞 항목이 더 최신).
        expiresAt,
      })),
      skipDuplicates: true,
    });
  } catch {
    // 저장 실패(중복 url/DB 비활성/쿼리 오류) → 무시(응답엔 영향 없음).
  }
}

/**
 * news 카드용 실데이터를 반환한다(ADR-058 — grounding 우선 + cache_news TTL).
 *
 * 흐름:
 *  1) queryKey 로 cache_news(미만료) 조회 → HIT 면 즉시 rows 반환(LLM 0회).
 *  2) MISS → searchNews(query)(Gemini grounding) → null 이면 폴백(null 반환).
 *     결과 있으면 cache_news 저장(best-effort) 후 rows 반환.
 *
 * best-effort: 절대 throw 하지 않는다(EmitA2UI 가 null → 폴백 텍스트 카드 처리).
 *
 * @param q       extractNewsQuery 결과(query 자연어 + queryKey 해시)
 * @param teamId  저장 시 teamId 칼럼(없으면 null)
 * @returns NewsData | null
 */
export async function fetchNewsData(
  q: NewsQuery,
  teamId?: string | null,
): Promise<NewsData | null> {
  // 1) 캐시 HIT(미만료) → 즉시 반환.
  const cached = await readCachedNews(q.queryKey);
  if (cached) {
    return cached;
  }

  // 2) MISS → grounding 검색.
  const items = await searchNews(q.query);
  if (items === null || items.length === 0) {
    return null; // 키 없음/검색 실패/빈 → 폴백(null).
  }

  // 검색 성공 → 캐시 저장(best-effort) 후 rows 반환.
  const normTeam =
    teamId !== undefined && teamId !== null && teamId.trim() !== ''
      ? teamId.trim()
      : null;
  await writeCachedNews(q.queryKey, normTeam, items);

  return toNewsRows(items.map((it) => formatNewsLine(it)));
}
