/**
 * UIComposer 노드 (W2: L1 Template only)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §4 (complexity 분기)
 *
 * W2 범위에서는 LLM을 호출하지 않고 intent→template 매핑만 수행한다.
 *  - intent에 L1 템플릿이 있으면(score→score_compact) 그대로 채택.
 *  - 없으면(chat 등) 텍스트-only 응답으로 EmitA2UI가 처리(여기서는 no-op).
 *
 * complexity는 IntentRouter에서 'simple' 고정. 실제 템플릿 컴파일/바인딩은
 * DataBinder + EmitA2UI 단계에서 수행한다. 본 노드는 분기 결정만 담당하며
 * W2 직선 파이프라인에서는 상태 변경이 없다(레지스트리 조회는 다운스트림에서).
 */
import type { CoreGraphState, CoreGraphUpdate } from '../state';

export function uiComposer(_state: CoreGraphState): CoreGraphUpdate {
  // W2: 결정론 직선 — intent는 이미 라우팅됨. 다운스트림(DataBinder/EmitA2UI)이
  // resolveTemplate(intent)로 L1 템플릿을 가져온다. 여기서는 상태 변경 없음.
  return {};
}
