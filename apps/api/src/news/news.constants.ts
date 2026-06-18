/**
 * news.constants.ts — NewsGraph(P3-W7 7.5, ADR-048) 상수.
 *
 * 크롤 대상 팀·쿼리, 요청 간격, TTL 등을 한곳에 둔다. CLAUDE.md "요청 간 10초+·동시 1".
 */

/** 크롤러 활성 게이트 env 키. 'true' 가 아니면 스케줄러 no-op(라이브 호출 차단). */
export const NEWS_CRAWLER_ENABLED_ENV = 'NEWS_CRAWLER_ENABLED';

/** 요청 간 대기(ms) — CLAUDE.md 불변식 "10초+". */
export const NEWS_REQUEST_DELAY_MS = 10_000;

/** 팀별 RSS 에서 추릴 상위 기사 수. */
export const NEWS_TOP_N = 5;

/** cache_news TTL(ms) — expiresAt = now + 24h. */
export const NEWS_TTL_MS = 24 * 60 * 60 * 1000;

/** cache_news.source 표기값(적재 출처 구분). */
export const NEWS_SOURCE_TAG = 'google-news';

/** 크롤 대상 팀 + 검색 쿼리(우선 4팀). 순차 크롤. */
export const NEWS_TEAM_QUERIES: ReadonlyArray<{
  teamId: string;
  query: string;
}> = [
  { teamId: 'hanwha', query: 'KBO 한화' },
  { teamId: 'doosan', query: 'KBO 두산' },
  { teamId: 'kia', query: 'KBO 기아' },
  { teamId: 'lotte', query: 'KBO 롯데' },
] as const;
