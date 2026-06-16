/**
 * OutputGuardrail 노드 (W2 stub) — 항상 pass
 *
 * SSOT: Ref-docs/specs/design/batdi-persona-guardrail.md (Output 팩트체크/비속어 재검증)
 *
 * ⚠️ W2 범위에서는 출력 팩트체크/비속어 재검증을 수행하지 않고 항상 통과시킨다(stub).
 *    감정 리액션 텍스트의 수치 언급 금지 검사 등은 W4+에서 보강.
 */
import type { CoreGraphState, CoreGraphUpdate } from '../state';

export function outputGuardrail(_state: CoreGraphState): CoreGraphUpdate {
  return { outputGuardrailResult: { pass: true } };
}
