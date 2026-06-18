/**
 * InputGuardrail 노드 (P2-W4.1) — rule-based 입력 가드레일
 *
 * SSOT: Ref-docs/specs/design/batdi-persona-guardrail.md §6.2
 *   B. 일베 밈/혐오, C. 프롬프트 해킹, D. 비속어/비하/위협/도박/자해
 *
 * ⚠️ ADR-051: 룰 패턴 + checkInputGuardrail/checkOutputGuardrail 순수 함수는
 *   @batdi/guardrail 로 추출되어 agent·api 가 공유한다(보안 룰 drift 차단, 단일 SSOT).
 *   본 모듈은 LangGraph 노드 래퍼(inputGuardrail)만 보유하고, 기존 import 경로 호환을 위해
 *   두 함수를 re-export 한다(`import { checkInputGuardrail } from '../nodes/input-guardrail'`
 *   호출처/테스트 그대로 동작).
 *
 * 매칭은 반드시 `userMessageNormalized` 기준으로 수행한다(원문 금지).
 */
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import { checkInputGuardrail, checkOutputGuardrail } from '@batdi/guardrail';

// 기존 호출처/테스트 호환을 위한 re-export (룰 구현 SSOT 는 @batdi/guardrail).
export { checkInputGuardrail, checkOutputGuardrail };

export function inputGuardrail(state: CoreGraphState): CoreGraphUpdate {
  const normalized = state.userMessageNormalized ?? '';
  return { inputGuardrailResult: checkInputGuardrail(normalized) };
}
