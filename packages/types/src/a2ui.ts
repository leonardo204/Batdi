/**
 * A2UI 표준 포맷 타입 (ADR-017 — A2UI v0.9 표준 다이얼렉트)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-017/019),
 *       Ref-docs/specs/interface/batdi-a2ui-palette-schema.md
 *
 * 폐기된 초안 다이얼렉트(`type` 키 / `bindings` 맵 / SurfaceUpdate /
 * DataModelUpdate / BeginRendering)는 제거됨. 표준 포맷은:
 *
 *  - 컴포넌트는 **평탄 인접 리스트**: 각 노드 `{ id, component, ...props, children? }`.
 *  - 타입 키는 **`component`** (NOT `type`).
 *  - `children`는 **자식 id 문자열 배열** (인라인 정의 금지).
 *  - **루트 노드의 id는 반드시 "root"**.
 *  - 값 슬롯(데이터 바인딩)은 prop 값으로 **`{ "path": "/json/pointer" }`**
 *    (JSON Pointer, 선행 슬래시). authoring 점경로 `home.score` → emit `/home/score`.
 *
 * 최종 전송 envelope은 `@ag-ui/a2ui-toolkit`의 op 빌더
 * (createSurface / updateComponents / updateDataModel) + wrapAsOperationsEnvelope
 * 로 조합한 **operations 배열**(또는 그 JSON 문자열)이다.
 */

/** 데이터 바인딩 값 슬롯 — JSON Pointer(선행 슬래시) */
export interface A2UIDataBinding {
  /** JSON Pointer 경로 (예: `/home/score`) */
  path: string;
}

/**
 * A2UI 컴포넌트 노드 (평탄 인접 리스트 항목)
 *
 * - `component`: 카탈로그 컴포넌트명 (Text/Row/Column/Button/TextField …)
 * - `children`: 자식 노드 **id 문자열 배열** (Row/Column 등 레이아웃에서 사용)
 * - 그 외 키: 정적 prop 값 또는 데이터 바인딩 슬롯(`A2UIDataBinding`)
 */
export interface A2UIComponentNode {
  /** 노드 식별자 (surface 내 유일, 루트는 "root") */
  id: string;
  /** 카탈로그 컴포넌트명 */
  component: string;
  /** 자식 노드 id 문자열 배열 */
  children?: string[];
  /** 정적 prop 또는 데이터 바인딩 슬롯 */
  [key: string]:
    | string
    | number
    | boolean
    | A2UIDataBinding
    | string[]
    | undefined;
}

/**
 * A2UI v0.9 단일 operation.
 *
 * `@ag-ui/a2ui-toolkit`의 op 빌더 반환 타입(`A2UIOperation = Record<string, unknown>`)과
 * 호환되는 느슨한 형태. 구체 op 형태는 아래 3종 인터페이스 참조.
 */
export type A2UIOperation = Record<string, unknown>;

/**
 * 아래 3종 op 인터페이스는 `@ag-ui/a2ui-toolkit` op 빌더의 실제 반환 형태를
 * 문서화한 것이다(빌더 반환은 `A2UIOperation = Record<string, unknown>`이며,
 * 런타임 코드는 빌더를 통해 op를 생성한다 — 이 인터페이스로 캐스팅하지 않는다).
 */

/** createSurface op — 표면 생성 + 카탈로그 바인딩 */
export interface CreateSurfaceOp {
  version: 'v0.9';
  createSurface: {
    surfaceId: string;
    catalogId: string;
  };
}

/** updateComponents op — 컴포넌트 트리(평탄 인접 리스트) 갱신 */
export interface UpdateComponentsOp {
  version: 'v0.9';
  updateComponents: {
    surfaceId: string;
    components: A2UIComponentNode[];
  };
}

/** updateDataModel op — 데이터 모델(팩트 값) 주입 */
export interface UpdateDataModelOp {
  version: 'v0.9';
  updateDataModel: {
    surfaceId: string;
    path: string;
    value: unknown;
  };
}

/**
 * A2UI Envelope — operations 배열.
 *
 * `wrapAsOperationsEnvelope(ops)`는 이 배열을 JSON 문자열로 직렬화하여 반환한다.
 * state(`a2uiEnvelope`)에는 op 배열 형태로 보관한다(transport 직전 wrap).
 */
export type A2UIEnvelope = A2UIOperation[];

/** AG-UI 이벤트 스트림 타입 (RunStarted/StateSnapshot/A2UIEnvelope/RunFinished) */
export type AgUiEventType =
  | 'RunStarted'
  | 'StateSnapshot'
  | 'A2UIEnvelope'
  | 'ToolResult'
  | 'RunFinished';
