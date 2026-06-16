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

/**
 * 밧디 고유 게이트 에러코드 (toolkit 위에 얹는 깊이/노드 한도 — palette-schema §5.4.1).
 * toolkit 의 구조/카탈로그/바인딩 코드와 합쳐 머신리더블 위반으로 보고한다.
 */
export type A2UIDepthNodeCode =
  | 'max_depth_exceeded'
  | 'max_nodes_exceeded'
  | 'cycle_or_dup_id'
  | 'dangling_child_ref';

/** 밧디 검증 통합 에러코드 (toolkit + 깊이/노드 게이트) */
export type BatdiA2UIValidationCode = A2UIValidationCode | A2UIDepthNodeCode;

/** 밧디 검증 에러 (toolkit A2UIValidationError 와 동형: code/path/message) */
export interface BatdiValidationError {
  code: BatdiA2UIValidationCode;
  path: string;
  message: string;
}

/** 밧디 검증 결과 (toolkit ValidateA2UIResult 의 superset — errors code 가 더 넓음) */
export interface BatdiValidateResult {
  valid: boolean;
  errors: BatdiValidationError[];
}

/** 깊이 상한 (palette-schema §5.4.1): 루트=깊이 1, 최대값이 4 초과면 위반 */
export const MAX_DEPTH = 4;
/** 노드 수 상한 (palette-schema §5.4.1): 도달 가능 노드 30 초과면 위반 */
export const MAX_NODES = 30;

/** 노드의 자식 id 목록 — `children`(배열) + `child`(단일, Button/Card 등) 모두 따른다. */
function childIdsOf(node: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const children = node['children'];
  if (Array.isArray(children)) {
    for (const c of children) if (typeof c === 'string') ids.push(c);
  }
  const child = node['child'];
  if (typeof child === 'string') ids.push(child);
  return ids;
}

/**
 * 깊이(maxDepth=4)·노드(maxNodes=30) 게이트 — palette-schema §5.4.1 BFS 알고리즘.
 *
 * 루트(id="root")에서 children/child 를 따라 BFS 하며 도달 노드 수·최대 깊이를 센다.
 *  - 루트 = 깊이 1, 직계 자식 = 깊이 2 … (1씩 증가)
 *  - 동일 id 재방문(순환/중복) → `cycle_or_dup_id` 위반
 *  - 인덱스에 없는 자식 참조(dangling) → `dangling_child_ref` 위반
 *  - 깊이 > 4 → `max_depth_exceeded`, 노드 > 30 → `max_nodes_exceeded` (확정 즉시 종료)
 *
 * 고아 노드(루트에서 도달 불가)는 카운트에서 제외한다(§5.4.1).
 * 루트가 없으면(toolkit `no_root` 가 별도 보고) 빈 배열을 반환해 중복 보고를 피한다.
 *
 * @returns 위반 에러 배열 (없으면 빈 배열). 조기 종료로 최대 1건만 담길 수 있다.
 */
export function checkDepthAndNodes(
  components: Array<Record<string, unknown>>,
  rootId = 'root',
): BatdiValidationError[] {
  const index = new Map<string, Record<string, unknown>>();
  for (const node of components) {
    const id = node['id'];
    if (typeof id === 'string') index.set(id, node);
  }
  // 루트 부재는 toolkit no_root 가 보고 → 여기선 게이트 스킵(중복 방지).
  if (!index.has(rootId)) return [];

  const visited = new Set<string>();
  let nodeCount = 0;
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 1 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift() as { id: string; depth: number };
    const node = index.get(id);
    if (node === undefined) {
      return [
        {
          code: 'dangling_child_ref',
          path: `/${id}`,
          message: `자식 참조 '${id}' 가 컴포넌트 인덱스에 없습니다(dangling).`,
        },
      ];
    }
    if (visited.has(id)) {
      return [
        {
          code: 'cycle_or_dup_id',
          path: `/${id}`,
          message: `id '${id}' 가 순환 또는 중복 참조되었습니다.`,
        },
      ];
    }
    visited.add(id);

    nodeCount += 1;
    if (depth > MAX_DEPTH) {
      return [
        {
          code: 'max_depth_exceeded',
          path: `/${id}`,
          message: `트리 깊이가 한도(${MAX_DEPTH})를 초과했습니다(깊이 ${depth}).`,
        },
      ];
    }
    if (nodeCount > MAX_NODES) {
      return [
        {
          code: 'max_nodes_exceeded',
          path: `/${id}`,
          message: `도달 가능 노드 수가 한도(${MAX_NODES})를 초과했습니다.`,
        },
      ];
    }

    for (const childId of childIdsOf(node)) {
      queue.push({ id: childId, depth: depth + 1 });
    }
  }
  return [];
}

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
 * + palette-schema §5.4.1 깊이≤4 / 노드≤30 게이트(`checkDepthAndNodes`)를 toolkit 검증
 *   위에 얹어 통합 보고한다(ADR-019 2단 게이트 중 화이트리스트=카탈로그, 깊이/노드=본 게이트).
 *   위반 시 호출부(databind/emit.ts buildA2UIOps)가 LLM 재호출 없이 L1 폴백 → §5.4 정책 충족.
 *   반환 타입은 BatdiValidateResult(toolkit 결과의 superset — errors code 가 더 넓음).
 */
export function validateBatdiA2UI(
  input: ValidateBatdiA2UIInput,
): BatdiValidateResult {
  const base = validateA2UIComponents({
    components: input.components,
    data: input.data,
    catalog: input.catalog ?? BATDI_BASIC_CATALOG,
    validateBindings: input.validateBindings ?? true,
  });
  const depthNodeErrors = checkDepthAndNodes(input.components);
  return {
    valid: base.valid && depthNodeErrors.length === 0,
    errors: [...(base.errors as BatdiValidationError[]), ...depthNodeErrors],
  };
}
