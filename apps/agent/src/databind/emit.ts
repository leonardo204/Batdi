/**
 * EmitA2UI 빌더 로직 (순수 함수 — 테스트 직접 호출용)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-017/019),
 *       Ref-docs/specs/interface/batdi-a2ui-palette-schema.md §5.4
 *       (UIValidator 실패 시 LLM 재호출 금지 → 즉시 L1 fallback)
 *
 * createSurface + updateComponents + updateDataModel(toolkit op 빌더)로 ops를 조합하고
 * validateBatdiA2UI로 검증한다. invalid면 LLM 재호출 없이 최소 Text 카드 폴백으로 재구성.
 */
import {
  createSurface,
  updateComponents,
  updateDataModel,
  type A2UIOperation,
} from '@ag-ui/a2ui-toolkit';
import { validateBatdiA2UI, BASIC_CATALOG_ID } from '@batdi/a2ui-schema';

/** 밧디 surface id (W2 단일 surface) */
export const BATDI_SURFACE_ID = 'batdi-main';

export interface BuildA2UIResult {
  /** 최종 operations 배열 (state.a2uiEnvelope에 저장 — 디버그/헤드리스 검증용) */
  ops: A2UIOperation[];
  /**
   * 최종 채택된 컴포넌트 인접 리스트 (valid면 입력 components, 실패면 폴백).
   * W2-B: render_a2ui 툴콜 args.components 로 그대로 사용한다.
   */
  components: Array<Record<string, unknown>>;
  /** 최종 데이터 모델 (render_a2ui 툴콜 args.data) */
  data: Record<string, unknown>;
  /** 검증 통과 여부 (false면 폴백 컴포넌트 사용됨) */
  valid: boolean;
  /** 폴백으로 재구성되었는지 */
  usedFallback: boolean;
  /** 검증 에러 (디버그/Langfuse 로깅용) */
  errors: ReturnType<typeof validateBatdiA2UI>['errors'];
}

/** 최소 Text 카드 폴백 컴포넌트 (root 단일 Text) */
export function buildFallbackComponents(
  text: string,
): Array<Record<string, unknown>> {
  return [{ id: 'root', component: 'Text', text }];
}

/**
 * 컴파일된 컴포넌트 + 데이터 모델로 A2UI ops를 빌드·검증한다.
 *
 * @param components 컴파일 완료(JSON Pointer 슬롯) 평탄 인접 리스트, root id="root"
 * @param data       updateDataModel에 주입할 데이터 모델 (바인딩 해석용)
 * @param fallbackText 검증 실패 시 폴백 Text 카드에 넣을 문구
 */
export function buildA2UIOps(
  components: Array<Record<string, unknown>>,
  data: Record<string, unknown>,
  fallbackText: string,
): BuildA2UIResult {
  const result = validateBatdiA2UI({ components, data, validateBindings: true });

  if (result.valid) {
    const ops: A2UIOperation[] = [
      createSurface(BATDI_SURFACE_ID, BASIC_CATALOG_ID),
      updateComponents(BATDI_SURFACE_ID, components),
      updateDataModel(BATDI_SURFACE_ID, data),
    ];
    return {
      ops,
      components,
      data,
      valid: true,
      usedFallback: false,
      errors: result.errors,
    };
  }

  // 검증 실패 → LLM 재호출 금지, 최소 Text 카드 폴백으로 즉시 재구성.
  // TODO(W3): palette-schema §5.4 는 "해당 intent의 L1 기본 Template으로 통째 폴백
  //   (부분 절단 금지)"을 명시한다. W2 는 score 1종뿐이라 단일 Text 카드로 단순화하나,
  //   intent별 L1 템플릿이 늘어나면 resolveTemplate 기반 폴백으로 정정해야 한다.
  //   ("재호출 금지 + 즉시 폴백" 핵심 안전 속성은 현재도 충족.)
  const fallbackComponents = buildFallbackComponents(fallbackText);
  const ops: A2UIOperation[] = [
    createSurface(BATDI_SURFACE_ID, BASIC_CATALOG_ID),
    updateComponents(BATDI_SURFACE_ID, fallbackComponents),
  ];
  return {
    ops,
    components: fallbackComponents,
    data: {},
    valid: false,
    usedFallback: true,
    errors: result.errors,
  };
}
