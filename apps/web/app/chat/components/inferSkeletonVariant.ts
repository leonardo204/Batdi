import type { SkeletonVariant } from './SkeletonCard';

/**
 * inferSkeletonVariant — 직전 사용자 입력 텍스트에서 SkeletonCard variant 를 추정한다.
 *
 * ⚠️ 백엔드 IntentRouter(키워드·정규식, LLM 미사용)의 *경량 프론트 미러* 일 뿐이다.
 *   정확한 intent 분류는 백엔드 소관이며, 여기선 "어떤 스켈레톤 골격을 띄울지"만 결정한다.
 *   추정 실패 시 'default' 로 폴백(잘못 맞춰도 CLS 영향만 있고 기능 영향 없음).
 *
 * 매칭은 항상 소문자화한 원문 부분일치(한국어는 대소문자 무관). 우선순위는 score > schedule
 *   > news > stats 순(더 구체적·실시간성 높은 의도를 우선).
 */
export function inferSkeletonVariant(text: string | null | undefined): SkeletonVariant {
  if (!text) return 'default';
  const t = text.toLowerCase();

  // 실시간 스코어 — 경기 결과/스코어/이기/지(고 있)
  if (/스코어|점수|몇\s*대\s*몇|이겼|졌|이기고|지고|승부|실시간|중계|득점/.test(t)) {
    return 'score';
  }
  // 경기 일정 — 언제/내일/오늘 경기/일정/상대
  if (/일정|언제\s*경기|경기\s*언제|내일|오늘\s*경기|다음\s*경기|상대팀|편성/.test(t)) {
    return 'schedule';
  }
  // 뉴스 — 뉴스/소식/기사/근황/이슈
  if (/뉴스|소식|기사|근황|이슈|화제|트레이드|부상\s*소식/.test(t)) {
    return 'news';
  }
  // 기본 스탯 — 타율/방어율/순위/성적/war/ops 등
  if (/타율|방어율|평균자책|순위|성적|기록|스탯|war|ops|era|홈런|타점|승률/.test(t)) {
    return 'stats';
  }

  return 'default';
}
