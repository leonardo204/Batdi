/**
 * DataBinder 노드 (W2)
 *
 * SSOT: CLAUDE.md "팩트(수치)는 DB → DataBinder → 템플릿 참조만"
 *
 * 책임: 템플릿의 `{{bind:"..."}}` 슬롯을 JSON Pointer로 컴파일하고, 팩트(수치)
 * 데이터 모델을 준비한다. 실제 컴파일+검증+emit은 EmitA2UI가 수행하므로
 * (W2 CoreState subset에 "compiled components" 채널이 없음) 본 노드는 직선
 * 파이프라인의 명시적 단계로만 존재하며 상태 변경은 없다.
 *
 * 컴파일 로직 자체는 ../databind/compile.ts(compileBindings/getStubDataModel)에
 * 순수 함수로 분리되어 EmitA2UI 및 단위테스트가 직접 호출한다.
 */
import type { CoreGraphState, CoreGraphUpdate } from '../state';

export function dataBinder(_state: CoreGraphState): CoreGraphUpdate {
  return {};
}
