/**
 * DataBinder 노드 (W2 → P2-W4.7)
 *
 * SSOT: CLAUDE.md "팩트(수치)는 DB → DataBinder → 템플릿 참조만",
 *       Ref-docs/specs/design/batdi-architecture.md §3.2 (UIComposer → DataBinder → TeamPersona)
 *
 * 책임: 템플릿 `{{bind:"..."}}` 슬롯 컴파일 + 팩트 데이터 바인딩을 위한 파이프라인 단계.
 *
 * ⚠️ P2-W4.7: 서비스 데이터 조회(fetchScoreData/fetchStandings)는 PersonalContext 와
 *   **병렬 실행**하기 위해 ServiceData 노드(nodes/service-data.ts)로 분리했다(ADR-011).
 *   실제 슬롯 컴파일·검증·emit 은 EmitA2UI 가 수행하므로(W2 CoreState 에 compiled 채널 없음)
 *   본 노드는 §3.2 흐름 보존용 명시 단계로만 존재하며 상태 변경은 없다(no-op).
 */
import type { CoreGraphState, CoreGraphUpdate } from '../state';

export function dataBinder(_state: CoreGraphState): CoreGraphUpdate {
  return {};
}
