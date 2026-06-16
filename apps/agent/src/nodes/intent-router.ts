/**
 * IntentRouter 노드 — LLM 미사용, 키워드/정규식 라우팅
 *
 * SSOT: Ref-docs/specs/interface/batdi-routing.md §2~§3 (canonical 7종 + 사전)
 *
 *  - userMessageNormalized 기준으로 순차 매칭, 첫 매칭 채택.
 *  - 미매칭 → intent='chat', intentConfidence='default'.
 *  - 매칭 → intentConfidence='high'.
 *  - W2 범위: complexity는 'simple' 고정 (UIComposer L1 Template only).
 *
 * NOTE: routing.md의 전량 사전을 그대로 옮겼다(W2 구현 대상은 score+chat이지만
 *       나머지 intent도 분류만 해 둔다 — 라우팅은 결정론이므로 무비용).
 *       statType('standings') 보조 분기는 W2 state에 미포함이므로 분류만 한다.
 */
import type { Intent } from '@batdi/types';
import type { CoreGraphState, CoreGraphUpdate } from '../state';

interface IntentRule {
  intent: Exclude<Intent, 'chat'>;
  pattern: RegExp;
}

/** routing.md §3 키워드/정규식 사전 (순서 = 우선순위) */
export const INTENT_RULES: ReadonlyArray<IntentRule> = [
  { intent: 'score', pattern: /스코어|점수|몇\s*대\s*몇|지금.*경기|이기고/ },
  // 순위/승률(standings) 우선 — 일반 stats보다 먼저
  { intent: 'stats', pattern: /순위|몇\s*위|승률/ },
  { intent: 'stats', pattern: /타율|방어율|홈런|era|war|ops|세이버/ },
  { intent: 'news', pattern: /뉴스|소식|기사/ },
  { intent: 'schedule', pattern: /일정|언제.*경기|다음.*경기/ },
  { intent: 'lineup', pattern: /선발|라인업|누가.*던져/ },
  { intent: 'meme', pattern: /밈|ㅋㅋ|웃긴/ },
];

export interface IntentClassification {
  intent: Intent;
  confidence: 'high' | 'default';
}

/** 순수 분류 함수 (테스트 직접 호출용) — 입력은 normalized form */
export function classifyIntent(normalized: string): IntentClassification {
  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(normalized)) {
      return { intent: rule.intent, confidence: 'high' };
    }
  }
  return { intent: 'chat', confidence: 'default' };
}

export function intentRouter(state: CoreGraphState): CoreGraphUpdate {
  const { intent, confidence } = classifyIntent(state.userMessageNormalized);
  return {
    intent,
    intentConfidence: confidence,
    complexity: 'simple', // W2: L1 only
  };
}
