/**
 * HeadToHeadGraph 서비스 (h2h intent — 팀 상대전적 카드 실데이터 배선, ADR-057)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-057, §3.5,
 *       CLAUDE.md "팩트(수치)는 DB → DataBinder → 템플릿 참조만".
 *
 * 책임:
 *  - 크롤러(api/kbo H2HWriter)가 적재한 `team_head_to_head`(Prisma TeamHeadToHead)에서
 *    특정 팀의 상대 9팀 전적을 한 줄씩 미리 포맷된 문자열(line)로 변환해 h2h_compact 슬롯
 *    (rows.N.line)에 싣는다.
 *  - 포맷 로직(formatH2HLine)은 **순수 함수**로 분리해 DB 없이 단위테스트한다.
 *  - DB 접근(fetchHeadToHead)은 getPrisma() best-effort — DATABASE_URL 없음/연결 실패/쿼리
 *    에러/빈 결과 시 null 을 반환하고 절대 throw 하지 않는다(emit 폴백 텍스트 카드).
 *
 * stats-graph.ts(formatStandingsLine + fetchStandings) / news-graph.ts(패딩)와 평행 패턴.
 * ⚠️ 상대전적은 LLM 감정 리액션을 생성하지 않으므로 h2h_compact 에는 /reaction 슬롯이 없다(L1).
 */
import { getPrisma } from '../utils/prisma';

/** 상대전적 한 줄 (미리 포맷된 문자열 — 카드의 단일 Text 노드 1개에 대응) */
export interface HeadToHeadRow {
  line: string;
}

/** 상대전적 데이터 (h2h_compact 템플릿 bind 경로 `rows.N.line` 과 1:1) */
export interface HeadToHeadData {
  rows: HeadToHeadRow[];
}

/**
 * team_head_to_head 행에서 HeadToHeadGraph 가 읽는 필드의 최소 구조(읽기 전용).
 * Prisma TeamHeadToHead 모델의 부분집합이라 prisma.teamHeadToHead 결과를 그대로 받는다.
 */
export interface TeamHeadToHeadRecord {
  opponentName: string | null;
  wins: number;
  losses: number;
  draws: number;
}

/** 상대전적 줄 개수 (상대 9팀 — h2h_compact rows.0.line..rows.8.line 과 일치) */
const H2H_ROW_COUNT = 9;

/**
 * team_head_to_head 1행 → 상대전적 카드 한 줄 문자열(순수 함수).
 *
 * 포맷: `vs ${opponentName} ${wins}승${losses}패${draws}무`
 *   예) "vs SSG 8승1패0무"
 *
 *  - opponentName 없으면 '상대' 폴백. 숫자는 DB 팩트라 카드 슬롯에 노출 OK(리액션 아님).
 */
export function formatH2HLine(rec: TeamHeadToHeadRecord): string {
  const name = (rec.opponentName ?? '').trim() || '상대';
  return `vs ${name} ${rec.wins}승${rec.losses}패${rec.draws}무`;
}

/**
 * h2h 카드용 실데이터를 DB(team_head_to_head)에서 읽어 HeadToHeadData 로 반환한다.
 *
 * best-effort: getPrisma() undefined(테스트/DATABASE_URL 없음) 또는 teamId 없음/쿼리 실패/
 * 빈 결과 시 null. 절대 throw 하지 않는다(호출부 emit 이 null → 폴백 텍스트 카드 처리).
 *
 *  - 현재 시즌(연도 = new Date().getFullYear()) + teamId
 *  - 승(wins) desc → 각 행 formatH2HLine → { rows: [{ line }, ...] }
 *  - 빈 결과 → null
 *  - rows.0.line..rows.8.line 9슬롯을 전부 바인딩하므로 9건 미만이면 빈 줄로 패딩(news 패턴).
 *
 * @param teamId 팀 코드(undefined/빈값이면 null)
 * @returns HeadToHeadData | null
 */
export async function fetchHeadToHead(
  teamId: string | undefined,
): Promise<HeadToHeadData | null> {
  if (teamId === undefined || teamId.trim() === '') {
    return null; // 팀 미지정 → 상대전적 대상 없음 → 폴백
  }

  const prisma = getPrisma();
  if (!prisma) {
    return null; // DB 비활성(테스트/DATABASE_URL 없음) → best-effort null
  }

  const season = new Date().getFullYear();

  try {
    const rows = (await prisma.teamHeadToHead.findMany({
      where: { season, teamId },
      orderBy: { wins: 'desc' },
      take: H2H_ROW_COUNT,
    })) as TeamHeadToHeadRecord[];

    if (rows.length === 0) {
      return null; // 적재 전/팀 없음 → 폴백
    }

    // h2h_compact 는 rows.0.line..rows.8.line 9슬롯을 전부 바인딩한다(validateBindings).
    // 적재가 9건 미만이어도 카드가 렌더되도록 빈 줄(공백)로 패딩해 9건을 채운다(news 패턴).
    const lines = rows.map((rec) => ({ line: formatH2HLine(rec) }));
    while (lines.length < H2H_ROW_COUNT) {
      lines.push({ line: ' ' });
    }
    return { rows: lines };
  } catch {
    // 연결/쿼리 실패 → best-effort null (그래프 실행 막지 않음, emit 폴백)
    return null;
  }
}
