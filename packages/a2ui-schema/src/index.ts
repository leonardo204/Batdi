/**
 * @batdi/a2ui-schema — A2UI 표준 포맷 검증 (ADR-017/019)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md
 *
 * 폐기된 ajv 기반 초안 다이얼렉트 스키마(schema.ts/validateEnvelope)는 제거됨.
 * 검증은 `@ag-ui/a2ui-toolkit`의 `validateA2UIComponents`(평탄 인접 리스트,
 * `component` 키, root id="root", `{path:"/..."}` 바인딩)를 사용한다.
 *
 * 본 패키지는 (a) 5종 기본 카탈로그 상수와 (b) 밧디 기본 카탈로그를 디폴트로
 * 주입하는 얇은 검증 래퍼를 제공한다.
 */
import {
  validateA2UIComponents,
  BASIC_CATALOG_ID,
  type A2UIValidationCatalog,
  type ValidateA2UIResult,
} from '@ag-ui/a2ui-toolkit';
import { BATDI_BASIC_CATALOG } from './catalog';

export { BATDI_BASIC_CATALOG, BATDI_CATALOG_COMPONENT_NAMES } from './catalog';
export { BASIC_CATALOG_ID };
export type { A2UIValidationCatalog, ValidateA2UIResult };

/** 검증 에러코드 (toolkit A2UIValidationError.code 와 동일) */
export type A2UIValidationCode =
  | 'empty_components'
  | 'missing_id'
  | 'missing_component_type'
  | 'duplicate_id'
  | 'no_root'
  | 'unknown_component'
  | 'missing_required_prop'
  | 'unresolved_child'
  | 'unresolved_binding';

export interface ValidateBatdiA2UIInput {
  /** 평탄 인접 리스트 (각 노드 `{ id, component, ...props, children? }`) */
  components: Array<Record<string, unknown>>;
  /** 데이터 모델 (절대 바인딩 `/...` 경로 해석용) */
  data?: Record<string, unknown>;
  /** 카탈로그 (기본: BATDI_BASIC_CATALOG) */
  catalog?: A2UIValidationCatalog;
  /** 절대 바인딩 경로를 data에 대해 해석 (기본 true) */
  validateBindings?: boolean;
}

/**
 * 밧디 기본 카탈로그를 디폴트로 주입하는 얇은 검증 래퍼.
 *
 * - 구조 검사(empty/missing_id/missing_component_type/duplicate_id/no_root/
 *   unresolved_child)는 항상 수행.
 * - 카탈로그 멤버십(unknown_component) + required prop(missing_required_prop) 검사는
 *   catalog 주입 시 수행 (기본으로 BATDI_BASIC_CATALOG 주입).
 * - validateBindings=true 면 `{path:"/..."}` 절대 경로를 data에 대해 해석.
 *
 * TODO(W3): palette-schema §5.4.1 의 깊이≤4 / 노드≤30 게이트는 아직 미적용.
 *   현재는 toolkit 검증(구조·카탈로그·바인딩)만 래핑한다. W3 LLM UIComposer(composite)
 *   도입 전, validateA2UIComponents 결과 위에 깊이/노드 한도 게이트를 추가해야 한다
 *   (ADR-019 2단 게이트 중 화이트리스트는 카탈로그로 충족, 깊이/노드 게이트가 잔여).
 *   W2 score_compact 는 9노드·depth 2 로 한도 내라 현재 실해 없음.
 */
export function validateBatdiA2UI(
  input: ValidateBatdiA2UIInput,
): ValidateA2UIResult {
  return validateA2UIComponents({
    components: input.components,
    data: input.data,
    catalog: input.catalog ?? BATDI_BASIC_CATALOG,
    validateBindings: input.validateBindings ?? true,
  });
}
