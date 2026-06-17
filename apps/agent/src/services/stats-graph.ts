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

// ─────────────────────────────────────────────────────────────────────────
// 선수 스탯 리더보드 (P3-W7 7.3b — player-stat 질의: 타율/방어율/홈런 등)
//
// "타율"·"방어율" 류 질의는 순위(standings)가 아니라 팀 선수 리더보드를 보여준다.
// standings 와 동일 패턴: 순수 포맷 함수 + getPrisma best-effort fetch + rows.N.line.
// player_stat_compact 템플릿(rows.0.line..rows.5.line)과 1:1 로 6줄을 만든다.
//
// ⚠️ 4팀(hanwha/doosan/kia/lotte)만 적재됨. 그 외 팀/데이터 없음 → null(폴백).
// ⚠️ 줄에 포함되는 숫자(타율/홈런/방어율 등)는 DB 팩트라 카드 슬롯(rows.N.line)에 싣는다.
//    리액션 텍스트가 아니므로 OutputGuardrail 검사 대상이 아니다(reaction 슬롯 없음).
// ─────────────────────────────────────────────────────────────────────────

/** 리더보드 종류 — 타자(batting) / 투수(pitching) */
export type StatKind = 'batting' | 'pitching';

/** 선수 스탯 리더보드 한 줄 (미리 포맷된 문자열 — 카드 단일 Text 노드 1개) */
export interface StatsLeaderboardRow {
  line: string;
}

/**
 * 선수 스탯 리더보드 데이터 (player_stat_compact 템플릿 bind 경로 `rows.N.line` 과 1:1).
 *  - kind: 타자/투수 (정렬·포맷 분기에 사용).
 *  - rows: 최대 6줄(상위 6명).
 */
export interface StatsLeaderboard {
  kind: StatKind;
  rows: StatsLeaderboardRow[];
}

/**
 * 질의(normalized)에서 리더보드 종류를 판정하는 순수 함수.
 *
 * 투수 키워드(방어율·era·평균자책·탈삼진·세이브·홀드·whip·fip·투수)가 있으면 'pitching',
 * 아니면 'batting'(기본). normalized 는 소문자·공백제거 형태라 정규식도 동일 기준.
 *
 *  예) '방어율어때' → 'pitching', '타율어때' → 'batting', '순위' → 'batting'(기본)
 */
export function detectStatKind(normalized: string): StatKind {
  if (/방어율|era|평균자책|탈삼진|세이브|홀드|whip|fip|투수/.test(normalized)) {
    return 'pitching';
  }
  return 'batting';
}

/**
 * BattingStat 행에서 리더보드가 읽는 필드의 최소 구조(읽기 전용 + player 관계).
 * Prisma battingStat.findMany({ include: { player: true } }) 결과의 부분집합.
 * avg/… 는 Prisma Decimal 이지만 Number(...) 로 안전 변환한다(toFixed 호출 위함).
 */
export interface BattingStatRow {
  avg: unknown;
  hr: number | null;
  rbi: number | null;
  player: { name: string | null } | null;
}

/**
 * PitchingStat 행에서 리더보드가 읽는 필드의 최소 구조(읽기 전용 + player 관계).
 */
export interface PitchingStatRow {
  era: unknown;
  strikeouts: number | null;
  whip: unknown;
  player: { name: string | null } | null;
}

/** Prisma Decimal | number | null 을 number 로 안전 변환(없으면 0) */
function toNum(v: unknown): number {
  if (v === null || v === undefined) {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 타자 리더보드 한 줄 문자열(순수 함수).
 *
 * 포맷: `${rank}  ${name}  ${avg(0.000)}  ${hr}홈런  ${rbi}타점`
 *   예) "1  레이예스  0.360  10홈런  49타점"
 *
 *  - avg 는 toFixed(3) 로 소수 3자리 고정(DB Float/Decimal 표기 안정화, 0.360 형식).
 *  - 숫자는 DB 팩트라 카드 슬롯에 그대로 노출 OK(리액션 아님).
 */
export function formatBattingLine(
  rank: number,
  name: string,
  avg: number,
  hr: number,
  rbi: number,
): string {
  return `${rank}  ${name}  ${avg.toFixed(3)}  ${hr}홈런  ${rbi}타점`;
}

/**
 * 투수 리더보드 한 줄 문자열(순수 함수).
 *
 * 포맷: `${rank}  ${name}  ${era(0.00)} ERA  ${strikeouts}K`
 *   예) "1  류현진  2.84 ERA  56K"
 *
 *  - era 는 toFixed(2) 로 소수 2자리 고정(방어율 관례).
 *  - whip 인자는 미래 확장 여지로 받되 현재 줄에는 era/K 만 노출(노드 6줄 가독).
 */
export function formatPitchingLine(
  rank: number,
  name: string,
  era: number,
  strikeouts: number,
  _whip?: number,
): string {
  return `${rank}  ${name}  ${era.toFixed(2)} ERA  ${strikeouts}K`;
}

/** 리더보드 줄 개수 (player_stat_compact take 6 과 일치 — 상위 6명) */
const PLAYER_ROW_COUNT = 6;

/**
 * 팀 선수 스탯 리더보드를 DB(batting_stats/pitching_stats + players)에서 읽어
 * StatsLeaderboard 로 반환한다.
 *
 * best-effort: getPrisma() undefined(테스트/DATABASE_URL 없음) 또는 teamId 없음/
 * 4팀 외/데이터 없음/쿼리 실패 시 null. 절대 throw 하지 않는다(emit 폴백 처리).
 *
 *  - 현재 시즌(연도 = new Date().getFullYear())
 *  - batting: avg not null, avg desc, take 6, include player → formatBattingLine
 *  - pitching: era not null, era asc, take 6, include player → formatPitchingLine
 *
 * @param teamId 팀 코드(없으면 null 반환).
 * @param kind   'batting' | 'pitching' (detectStatKind 결과).
 * @returns StatsLeaderboard | null
 */
export async function fetchPlayerLeaderboard(
  teamId: string | undefined,
  kind: StatKind,
): Promise<StatsLeaderboard | null> {
  if (teamId === undefined || teamId.trim() === '') {
    return null; // 팀 미지정 → 리더보드 대상 없음 → 폴백
  }

  const prisma = getPrisma();
  if (!prisma) {
    return null; // DB 비활성(테스트/DATABASE_URL 없음) → best-effort null
  }

  const season = new Date().getFullYear();

  try {
    if (kind === 'pitching') {
      const rows = (await prisma.pitchingStat.findMany({
        where: { teamId, season, era: { not: null } },
        orderBy: { era: 'asc' },
        take: PLAYER_ROW_COUNT,
        include: { player: true },
      })) as PitchingStatRow[];

      if (rows.length === 0) {
        return null; // 적재 전/4팀 외 → 폴백
      }

      return {
        kind: 'pitching',
        rows: rows.map((r, i) => ({
          line: formatPitchingLine(
            i + 1,
            r.player?.name ?? '??',
            toNum(r.era),
            r.strikeouts ?? 0,
            toNum(r.whip),
          ),
        })),
      };
    }

    // batting (기본)
    const rows = (await prisma.battingStat.findMany({
      where: { teamId, season, avg: { not: null } },
      orderBy: { avg: 'desc' },
      take: PLAYER_ROW_COUNT,
      include: { player: true },
    })) as BattingStatRow[];

    if (rows.length === 0) {
      return null; // 적재 전/4팀 외 → 폴백
    }

    return {
      kind: 'batting',
      rows: rows.map((r, i) => ({
        line: formatBattingLine(
          i + 1,
          r.player?.name ?? '??',
          toNum(r.avg),
          r.hr ?? 0,
          r.rbi ?? 0,
        ),
      })),
    };
  } catch {
    // 연결/쿼리 실패 → best-effort null (그래프 실행 막지 않음, emit 폴백)
    return null;
  }
}
