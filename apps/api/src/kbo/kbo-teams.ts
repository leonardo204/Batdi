/**
 * kbo-teams.ts — 팀 코드 · 시리즈 타입 · 취소 사유 매핑 (순수 함수/상수, SSOT).
 *
 * 레퍼런스: github.com/colabear754/kbo-scraper 의 Team/SeriesType/CancellationReason enum 포팅.
 * 한국어 팀명 → 내부 팀 코드, KBO 드롭다운 value → 시리즈, 비고 텍스트 → 취소 사유.
 */

/** 내부 팀 코드 */
export type TeamCode =
  | 'doosan'
  | 'samsung'
  | 'lotte'
  | 'hanwha'
  | 'lg'
  | 'kia'
  | 'heroes'
  | 'nc'
  | 'kt'
  | 'ssg'
  | 'unknown';

/** 한국어 팀명 → 팀 코드 매핑 */
const TEAM_NAME_TO_CODE: Record<string, TeamCode> = {
  두산: 'doosan',
  삼성: 'samsung',
  롯데: 'lotte',
  한화: 'hanwha',
  LG: 'lg',
  KIA: 'kia',
  키움: 'heroes',
  NC: 'nc',
  KT: 'kt',
  SSG: 'ssg',
};

/**
 * 한국어 팀명을 팀 코드로 변환. 매칭 없으면 'unknown'.
 */
export function toTeamCode(teamName: string): TeamCode {
  const normalized = teamName.trim();
  return TEAM_NAME_TO_CODE[normalized] ?? 'unknown';
}

/** 시리즈 타입 이름 (DB 저장 값) */
export type SeriesTypeName = 'PRESEASON' | 'REGULAR_SEASON' | 'POSTSEASON';

/**
 * 시리즈 타입 정의. `code` 는 KBO 드롭다운(`#ddlSeries`) value.
 * - PRESEASON: 시범경기 (1)
 * - REGULAR_SEASON: 정규시즌 (0,9,6)
 * - POSTSEASON: 포스트시즌 (3,4,5,7)
 */
export interface SeriesType {
  readonly name: SeriesTypeName;
  readonly code: string;
}

export const SERIES_TYPES: readonly SeriesType[] = [
  { name: 'PRESEASON', code: '1' },
  { name: 'REGULAR_SEASON', code: '0,9,6' },
  { name: 'POSTSEASON', code: '3,4,5,7' },
] as const;

/** 이름으로 시리즈 타입 조회 */
export function getSeriesType(name: SeriesTypeName): SeriesType {
  const found = SERIES_TYPES.find((s) => s.name === name);
  if (!found) {
    throw new Error(`알 수 없는 시리즈 타입: ${name}`);
  }
  return found;
}

/** 경기 취소 사유 코드 */
export type CancellationReason =
  | 'GROUND_CONDITION'
  | 'RAIN'
  | 'HEATWAVE'
  | 'FINE_DUST'
  | 'STRONG_WIND'
  | 'YELLOW_DUST'
  | 'ETC';

/**
 * 비고 셀 텍스트 → 취소 사유 코드.
 * "-"(취소 아님) 또는 빈 문자열이면 null 반환.
 * 키워드 미매칭이지만 비어있지 않으면 ETC.
 */
export function cancellationReasonFromString(
  raw: string,
): CancellationReason | null {
  const text = raw.trim();
  if (text === '' || text === '-') {
    return null;
  }
  if (text.includes('그라운드')) return 'GROUND_CONDITION';
  if (text.includes('우천')) return 'RAIN';
  if (text.includes('폭염')) return 'HEATWAVE';
  if (text.includes('미세먼지')) return 'FINE_DUST';
  if (text.includes('강풍')) return 'STRONG_WIND';
  if (text.includes('황사')) return 'YELLOW_DUST';
  return 'ETC';
}

/** 경기 상태 코드 */
export type GameStatus = 'SCHEDULED' | 'PLAYING' | 'FINISHED' | 'CANCELLED';
