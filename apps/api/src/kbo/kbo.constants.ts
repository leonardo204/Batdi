/**
 * kbo.constants.ts — KBO 크롤러 URL · 셀렉터 · 딜레이 상수 (SSOT).
 *
 * 레퍼런스: github.com/colabear754/kbo-scraper (kbo-scraper.yml) 의 URL/셀렉터를 그대로 포팅.
 * robots.txt 준수(해당 경로 허용): /Schedule/ · /Record/ 는 Disallow 대상이 아니다
 * (Disallow 는 /Common · /Help · /Member · /ws 뿐).
 *
 * ⚠️ CLAUDE.md 불변식 "크롤링 부하 제한: 요청 간격 10초+·동시 1·robots.txt 준수".
 * REQUEST_DELAY_MS 는 10초 이상으로 고정한다. 일일 스케줄이라 레이턴시는 무관.
 */

/** 경기일정 페이지 */
export const SCHEDULE_URL =
  'https://www.koreabaseball.com/Schedule/Schedule.aspx';

/** 팀순위 페이지 */
export const TEAM_RANK_URL =
  'https://www.koreabaseball.com/Record/TeamRank/TeamRank.aspx';

/** 경기일정 페이지 셀렉터 (드롭다운 + 테이블 tbody) */
export const SCHEDULE_SELECTORS = {
  year: '#ddlYear',
  month: '#ddlMonth',
  series: '#ddlSeries',
  /** 경기일정 테이블의 tbody — outerHTML 추출 대상 */
  gamesTable: '#tblScheduleList > tbody',
} as const;

/** 팀순위 페이지 셀렉터 (드롭다운 + 테이블 tbody) */
export const TEAM_RANK_SELECTORS = {
  year: '#cphContents_cphContents_cphContents_ddlYear',
  series: '#cphContents_cphContents_cphContents_ddlSeries',
  /** 팀순위 테이블의 tbody */
  rankTable: '#cphContents_cphContents_cphContents_udpRecord > table > tbody',
} as const;

/**
 * 요청 간격(ms). 페이지 네비게이션·드롭다운 갱신 사이에 이만큼 대기한다.
 * CLAUDE.md 불변식에 따라 10초 이상 — 절대 줄이지 마라.
 */
export const REQUEST_DELAY_MS = 10_000;

/** 크롤러 활성 여부 환경변수 키. 미설정/'true' 아니면 비활성(no-op). */
export const CRAWLER_ENABLED_ENV = 'KBO_CRAWLER_ENABLED';

/** KBO 정규시즌 운영 월 범위 (백필용): 3월~11월 */
export const SEASON_START_MONTH = 3;
export const SEASON_END_MONTH = 11;
