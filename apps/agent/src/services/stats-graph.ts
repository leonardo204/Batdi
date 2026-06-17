/**
 * StatsGraph 서비스 (stats intent — 팀 순위 standings 카드 실데이터 배선)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.5 (ServiceSubgraph summary/ref 분리),
 *       CLAUDE.md "팩트(수치)는 DB → DataBinder → 템플릿 참조만"
 *
 * 책임:
 *  - 크롤러가 적재한 `team_season_records`(Prisma TeamSeasonRecord, 10팀)에서
 *    순위 카드용 실데이터를 읽어 한 팀당 미리 포맷된 단일 문자열(line)로 변환한다.
 *  - 핵심 포맷 로직(formatStandingsLine)은 **순수 함수**로 분리해 단위테스트가 DB 없이
 *    직접 검증한다. TEAM_DISPLAY_NAME(팀코드→한글)은 score-graph 에서 재사용한다.
 *  - DB 접근(fetchStandings)은 getPrisma() best-effort — DATABASE_URL 없음/연결 실패/
 *    쿼리 에러 시 null 을 반환하고 절대 throw 하지 않는다(graceful degradation).
 *
 * ⚠️ 한 팀당 단일 Text 줄(미리 포맷된 문자열)로 구성해 standings_compact 템플릿이
 *    Column[root] = [title, line0..line9] = 12노드/깊이2 로 maxNodes=30/maxDepth=4
 *    게이트를 넉넉히 통과하게 한다(Row×셀 표는 50+노드라 초과 → 금지).
 *
 * ⚠️ 줄에 포함되는 숫자(순위/승패무/승률)는 DB 팩트라 DataBinder 경유 updateDataModel 로
 *    카드 data model 에 주입된다. 리액션 텍스트가 아니므로 숫자 허용
 *    (OutputGuardrail 은 /reaction 슬롯만 검사. standings 템플릿엔 reaction 슬롯 없음).
 */
import { TEAM_DISPLAY_NAME } from './score-graph';
import { getPrisma } from '../utils/prisma';

/** 순위 한 줄 (미리 포맷된 문자열 — 카드의 단일 Text 노드 1개에 대응) */
export interface StandingsRow {
  line: string;
}

/** 팀 순위 데이터 (standings_compact 템플릿 bind 경로 `rows.N.line` 과 1:1) */
export interface StandingsData {
  rows: StandingsRow[];
}

/**
 * TeamSeasonRecord 행에서 StatsGraph 가 읽는 필드의 최소 구조(읽기 전용).
 * Prisma TeamSeasonRecord 모델의 부분집합이라 prisma.teamSeasonRecord 결과를 그대로 받는다.
 */
export interface TeamSeasonRecordRow {
  season: number;
  team: string;
  teamRank: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

/**
 * team_season_records 1행 → 순위 카드 한 줄 문자열(순수 함수).
 *
 * 포맷: `${teamRank}  ${한글팀명}  ${wins}승${losses}패${draws}무  ${winRate.toFixed(3)}`
 *   예) "1  LG  41승24패0무  0.631"
 *
 *  - 팀명은 TEAM_DISPLAY_NAME 매핑. 미지 팀코드는 코드 그대로 노출(?? team).
 *  - winRate 는 항상 소수 3자리(toFixed(3)) — DB Float 라 표기 안정화.
 */
export function formatStandingsLine(rec: TeamSeasonRecordRow): string {
  const name = TEAM_DISPLAY_NAME[rec.team] ?? rec.team;
  const record = `${rec.wins}승${rec.losses}패${rec.draws}무`;
  return `${rec.teamRank}  ${name}  ${record}  ${rec.winRate.toFixed(3)}`;
}

/**
 * standings 카드용 실데이터를 DB(team_season_records)에서 읽어 StandingsData 로 반환한다.
 *
 * best-effort: getPrisma() undefined(테스트/DATABASE_URL 없음) 또는 쿼리 실패 시 null.
 * 절대 throw 하지 않는다(호출부 DataBinder 가 null → emit 폴백 처리).
 *
 *  - 현재 시즌(연도 = new Date().getFullYear())
 *  - teamRank asc, take 10 → 각 행 formatStandingsLine → { rows: [{ line }, ...] }
 *  - 빈 결과 → null
 *
 * @returns StandingsData | null
 */
export async function fetchStandings(): Promise<StandingsData | null> {
  const prisma = getPrisma();
  if (!prisma) {
    return null; // DB 비활성(테스트/DATABASE_URL 없음) → best-effort null
  }

  const season = new Date().getFullYear();

  try {
    const rows = (await prisma.teamSeasonRecord.findMany({
      where: { season },
      orderBy: { teamRank: 'asc' },
      take: 10,
    })) as TeamSeasonRecordRow[];

    if (rows.length === 0) {
      return null; // 적재 전/시즌 없음 → 폴백
    }

    return { rows: rows.map((rec) => ({ line: formatStandingsLine(rec) })) };
  } catch {
    // 연결/쿼리 실패 → best-effort null (그래프 실행 막지 않음, emit 폴백)
    return null;
  }
}
