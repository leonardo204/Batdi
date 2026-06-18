/**
 * LineupGraph 서비스 (lineup intent — 선발 라인업 카드 실데이터 배선, ADR-052 → ADR-056)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-056, §3.5,
 *       CLAUDE.md "팩트(수치)는 DB → DataBinder → 템플릿 참조만".
 *
 * 책임:
 *  - lineup_compact 템플릿 슬롯(team + rows.0~8.line)에 실릴 선발 라인업 데이터를 조립한다.
 *  - ADR-056: GameCenter 크롤러(LineupWriter)가 적재한 `game_lineups`(Prisma GameLineup)에서
 *    팀(home OR away = teamId) 당일/차기 경기를 조회해 **선발투수 매치업** 카드를 구성한다.
 *    데이터가 없으면(미적재/DB 없음/미지원 팀) null → EmitA2UI 가 "라인업은 경기 임박 시
 *    공개돼요" 류 팀 톤 폴백 텍스트 카드로 방출.
 *  - 포맷 로직(buildLineupRows)은 **순수 함수**로 분리해 DB 없이 단위테스트한다.
 *
 * news-graph.ts/schedule-graph.ts 평행 패턴. ⚠️ 라인업은 LLM 감정 리액션을 생성하지 않으므로
 * lineup_compact 에는 /reaction 슬롯이 없다(L1). 수치(시각 등)는 사전 포맷 문자열 안에만 존재.
 *
 * 🚧 ADR-056 잔여: 풀 9타순(lineup_ck 게시 후 상세페이지)은 미도입 — 현재는 선발 매치업 행만.
 */
import { getPrisma } from '../utils/prisma';
import { TEAM_DISPLAY_NAME } from './score-graph';

/** 라인업 한 줄 (미리 포맷된 문자열 — 카드의 단일 Text 노드 1개에 대응) */
export interface LineupRow {
  line: string;
}

/**
 * 라인업 데이터 (lineup_compact 템플릿 bind 경로와 1:1).
 *   - team: 헤더 캡션(팀명)
 *   - rows.N.line: N번째 줄(사전 포맷 문자열, 9슬롯 — 부족분은 공백 패딩)
 */
export interface LineupData {
  team: string;
  rows: LineupRow[];
}

/**
 * game_lineups 행에서 LineupGraph 가 읽는 필드의 최소 구조(읽기 전용).
 * Prisma GameLineup 모델의 부분집합이라 prisma.gameLineup 결과를 그대로 받는다.
 */
export interface GameLineupRecord {
  gameDate: Date;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeStarter: string | null;
  awayStarter: string | null;
  stadium: string | null;
  gameTime: string | null;
  status: string;
}

/** lineup_compact rows 슬롯 수 (rows.0.line .. rows.8.line) */
const LINEUP_ROW_COUNT = 9;

/** 팀 코드 → 한글명. 미지/빈 코드는 코드 그대로(없으면 '??') */
function teamDisplay(code: string | null | undefined): string {
  if (code === null || code === undefined || code.trim() === '') {
    return '??';
  }
  return TEAM_DISPLAY_NAME[code] ?? code;
}

/** 선발투수명 표시(없으면 '미정') */
function starterDisplay(name: string | null | undefined): string {
  const s = (name ?? '').trim();
  return s !== '' ? s : '미정';
}

/**
 * game_lineups 1행 + 우리 팀 관점(teamId) → 선발 매치업 카드 행 배열(순수 함수, 9슬롯 패딩).
 *
 * 우리 팀이 home/away 중 어디인지 판별해 "우리 선발 / 상대" 관점으로 구성한다.
 *   rows = [
 *     "우리 선발: {우리팀} {우리 선발}",
 *     "상대: {상대팀} {상대 선발}",
 *     "구장: {구장} {시각}",   ← 구장/시각 없으면 줄 생략
 *     "상태: {상태}",
 *   ] → 9슬롯까지 공백(' ') 패딩.
 *
 *  - teamId 가 home/away 어느 쪽과도 매칭 안 되면(미지원 팀 등) home 관점("우리 선발"=home)으로 폴백.
 *  - 수치(시각)는 사전 포맷 문자열 안에만 존재(LLM 미생성, ADR-019).
 *
 * @param rec game_lineups 행
 * @param teamId 우리 팀 코드(undefined 면 home 관점)
 * @returns { team, rows } — team 은 우리 팀 한글 표시명
 */
export function buildLineupRows(
  rec: GameLineupRecord,
  teamId?: string,
): LineupData {
  const tid = (teamId ?? '').trim();
  // 우리 팀이 away 면 away 관점, 아니면(home 매칭 또는 미매칭) home 관점.
  const weAreAway = tid !== '' && rec.awayTeamId === tid;

  const ourName = weAreAway
    ? teamDisplay(rec.awayTeamId ?? rec.awayTeamName)
    : teamDisplay(rec.homeTeamId ?? rec.homeTeamName);
  const oppName = weAreAway
    ? teamDisplay(rec.homeTeamId ?? rec.homeTeamName)
    : teamDisplay(rec.awayTeamId ?? rec.awayTeamName);
  // 표시명은 매핑 우선, 없으면 크롤 원문 한글명(home_nm/away_nm)로 폴백.
  const ourDisplay = weAreAway
    ? displayOrRaw(rec.awayTeamId, rec.awayTeamName)
    : displayOrRaw(rec.homeTeamId, rec.homeTeamName);
  const oppDisplay = weAreAway
    ? displayOrRaw(rec.homeTeamId, rec.homeTeamName)
    : displayOrRaw(rec.awayTeamId, rec.awayTeamName);
  const ourStarter = weAreAway ? rec.awayStarter : rec.homeStarter;
  const oppStarter = weAreAway ? rec.homeStarter : rec.awayStarter;
  // (ourName/oppName 은 매핑 미스 시 '??' 가능 → display 폴백을 우선 사용)
  void ourName;
  void oppName;

  const lines: LineupRow[] = [
    { line: `우리 선발: ${ourDisplay} ${starterDisplay(ourStarter)}` },
    { line: `상대: ${oppDisplay} ${starterDisplay(oppStarter)}` },
  ];

  const stadium = (rec.stadium ?? '').trim();
  const time = (rec.gameTime ?? '').trim();
  if (stadium !== '' && time !== '') {
    lines.push({ line: `구장: ${stadium} ${time}` });
  } else if (stadium !== '') {
    lines.push({ line: `구장: ${stadium}` });
  } else if (time !== '') {
    lines.push({ line: `시각: ${time}` });
  }

  const status = (rec.status ?? '').trim();
  if (status !== '') {
    lines.push({ line: `상태: ${status}` });
  }

  // 9슬롯 전부 바인딩되도록 공백 줄 패딩(validateBindings 통과).
  while (lines.length < LINEUP_ROW_COUNT) {
    lines.push({ line: ' ' });
  }
  // 혹시 9개를 초과하면(이론상 없음) 잘라낸다.
  return { team: ourDisplay, rows: lines.slice(0, LINEUP_ROW_COUNT) };
}

/** teamId 매핑명(있으면) 우선, 없으면 크롤 원문 한글명 폴백 */
function displayOrRaw(
  teamId: string | null,
  rawName: string,
): string {
  if (teamId !== null && teamId.trim() !== '') {
    const mapped = TEAM_DISPLAY_NAME[teamId];
    if (mapped !== undefined) {
      return mapped;
    }
  }
  const raw = (rawName ?? '').trim();
  return raw !== '' ? raw : '??';
}

/**
 * lineup 카드용 실데이터를 DB(game_lineups)에서 읽어 LineupData 로 반환한다 (ADR-056).
 *
 * best-effort: getPrisma() undefined(테스트/DATABASE_URL 없음) 또는 쿼리 실패/빈 결과 시 null.
 * 절대 throw 하지 않는다(호출부 emit 이 null → 폴백 텍스트 카드 처리).
 *
 *  - teamId 있으면 (homeTeamId=teamId OR awayTeamId=teamId), 없으면 null(폴백).
 *  - 오늘 0시 이후(gameDate >= 오늘 0시) 당일/차기 경기, gameDate asc, take 1.
 *  - 빈 결과 → null. 있으면 buildLineupRows 로 매치업 카드 구성.
 *
 * @param teamId 팀 코드(undefined 면 null — 라인업은 팀 컨텍스트 필수)
 * @returns LineupData | null
 */
export async function fetchLineupData(
  teamId?: string,
): Promise<LineupData | null> {
  const tid = (teamId ?? '').trim();
  if (tid === '') {
    return null; // 라인업은 팀 컨텍스트 없으면 조회 불가 → 폴백.
  }

  const prisma = getPrisma();
  if (!prisma) {
    return null; // DB 비활성(테스트/DATABASE_URL 없음) → best-effort null
  }

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  try {
    const rec = (await prisma.gameLineup.findFirst({
      where: {
        gameDate: { gte: today },
        OR: [{ homeTeamId: tid }, { awayTeamId: tid }],
      },
      orderBy: { gameDate: 'asc' },
    })) as GameLineupRecord | null;

    if (!rec) {
      return null; // 당일/차기 경기 라인업 없음 → 폴백.
    }

    return buildLineupRows(rec, tid);
  } catch {
    // 연결/쿼리 실패 → best-effort null (그래프 실행 막지 않음, emit 폴백)
    return null;
  }
}
