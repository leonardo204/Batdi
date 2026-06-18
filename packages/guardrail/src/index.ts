/**
 * @batdi/guardrail — 입력 정규화 + rule-based 가드레일 공유 패키지 (ADR-051)
 *
 * SSOT: Ref-docs/specs/design/batdi-persona-guardrail.md §6.2
 *
 * agent(LangGraph Normalizer/InputGuardrail 노드)와 api(custom_persona 저장 전 검증)가
 * 동일한 순수 함수를 import 하여 보안 룰 drift(복제로 인한 우회)를 차단한다.
 */
export { toNormalizedForm, toDisplayForm } from './normalize.js';
export { checkInputGuardrail, checkOutputGuardrail } from './guardrail.js';
