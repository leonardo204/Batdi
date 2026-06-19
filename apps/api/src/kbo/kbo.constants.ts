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

/**
 * GameCenter 메인 — 당일 경기/선발투수 라인업 (ADR-056).
 * robots.txt 허용(Disallow 는 /Common · /Help · /Member · /ws 뿐 → /Schedule/ 허용).
 */
export const GAMECENTER_URL =
  'https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx';

/** 타자 기본기록 페이지 (선수 기본 스탯, P3-W7 7.3a) */
export const HITTER_BASIC_URL =
  'https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx';

/** 투수 기본기록 페이지 (선수 기본 스탯, P3-W7 7.3a) */
export const PITCHER_BASIC_URL =
  'https://www.koreabaseball.com/Record/Player/PitcherBasic/Basic1.aspx';

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
  /**
   * 상대전적 매트릭스 표(ADR-057, 2026-06-19 실측 확정).
   *  - TeamRank.aspx 동일 페이지의 `#...pnlVsTeam > table`(class tData) 표.
   *  - 헤더: `팀명` + `{상대팀}(승-패-무)`×10 + `합계`. 행: 행팀명 + 매트릭스 셀(W-L-D)/■/합계.
   *  - 순위 표(rankTable)와 별개 table 이라 1회 로드로 함께 추출한다.
   *  - ⚠️ rankTable 과 달리 `> tbody` 가 아니라 **table 전체**를 추출한다: 컬럼→상대팀 매핑에
   *    필요한 헤더 행이 `<thead>`(tbody 밖)에 있어 tbody 만 잡으면 헤더가 누락된다(실측 확정).
   */
  vsTeamTable: '#cphContents_cphContents_cphContents_pnlVsTeam > table',
} as const;

/**
 * GameCenter 라인업 셀렉터 (ADR-056, 2026-06-18 실측 확정).
 *  - 각 경기는 `li.game-cont`(또는 `.today-game .game-cont`). 정형 데이터 속성 보유:
 *    g_id(=gameKey), g_dt, s_nm(구장), away_nm/home_nm(한글팀명), away_id/home_id(코드),
 *    away_p_id/home_p_id(선발투수 ID), start_ck/lineup_ck.
 *  - 선발투수명은 `.team.away .today-pitcher p` / `.team.home .today-pitcher p` 텍스트
 *    ("선" 접두 span.before 제거 후 이름). 시각은 `.top ul li`(마지막), 상태는 `.staus`(원문 클래스 오타).
 *  - g_id 와 텍스트 모두 away-then-home 순(예 "20260618KTOB0" = KT@OB, 텍스트 "선{away} VS 선{home}").
 *    다만 파서는 .team.away / .team.home 구획을 직접 읽어 순서 모호성을 제거한다.
 */
export const GAMECENTER_SELECTORS = {
  /** 경기 카드 목록 — li.game-cont 순회(outerHTML 단위 파싱) */
  gameList: 'li.game-cont',
  /** 컨테이너 등장 대기용 */
  ready: '.today-game .game-cont, li.game-cont',
} as const;

/**
 * GameCenter 한글 팀명 → 내부 팀 코드 매핑(ADR-056). 미지원 팀은 매핑 없음(null 처리).
 * 우선 지원 4팀 + 표시 가능한 전 구단 한글명을 수용한다(home_nm/away_nm 기준).
 * ⚠️ teamId 미지원 팀(매핑 없음)은 null 로 저장하고 표시명(home_nm)만 보존한다.
 */
export const GAMECENTER_TEAM_NAME_TO_ID: Record<string, string> = {
  두산: 'doosan',
  KIA: 'kia',
  기아: 'kia',
  롯데: 'lotte',
  한화: 'hanwha',
  LG: 'lg',
  KT: 'kt',
  삼성: 'samsung',
  NC: 'nc',
  SSG: 'ssg',
  키움: 'heroes',
} as const;

/**
 * 선수 기본기록 페이지 셀렉터 (타자/투수 공통, 드롭다운 + tData01 테이블).
 * 시즌/팀 드롭다운 선택 시 ASP.NET UpdatePanel 부분 포스트백으로 table.tData01 이 갱신된다.
 * → selectAndWaitForTableReload(tableSelector='table.tData01') 로 stale read 방지.
 */
export const PLAYER_STAT_SELECTORS = {
  season: '#cphContents_cphContents_cphContents_ddlSeason_ddlSeason',
  team: '#cphContents_cphContents_cphContents_ddlTeam_ddlTeam',
  /** 타자/투수 기본기록 테이블 — outerHTML 추출 대상 */
  table: 'table.tData01',
} as const;

/**
 * 선수 스탯 페이지 팀 드롭다운 value 코드 (내부 팀 코드 → KBO value).
 * ⚠️ 우선 지원 4팀만 크롤한다(한화·두산·KIA·롯데).
 * (참고 전체 코드: HH=한화, OB=두산, HT=KIA, LT=롯데, LG, KT, SS=삼성, NC, SK=SSG, WO=키움.)
 */
export const PLAYER_TEAM_CODE: Record<string, string> = {
  hanwha: 'HH',
  doosan: 'OB',
  kia: 'HT',
  lotte: 'LT',
} as const;

/** 선수 스탯 크롤 대상 우선 4팀(내부 팀 코드 순서) */
export const PLAYER_STAT_TEAM_IDS = ['hanwha', 'doosan', 'kia', 'lotte'] as const;

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
