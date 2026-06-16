/**
 * InputGuardrail 노드 (W2 stub) — 항상 pass
 *
 * SSOT: Ref-docs/specs/design/batdi-persona-guardrail.md (Input 3중 검증)
 *
 * ⚠️ W2 범위에서는 일베/비속어/프롬프트해킹/아동보호/Semantic 검사를 수행하지 않고
 *    항상 통과시킨다(stub). 실제 검사는 W4+에서 보강.
 *    매칭은 반드시 userMessageNormalized 기준으로 수행해야 한다(원문 금지).
 */
import type { CoreGraphState, CoreGraphUpdate } from '../state';

export function inputGuardrail(_state: CoreGraphState): CoreGraphUpdate {
  return { inputGuardrailResult: { pass: true } };
}
