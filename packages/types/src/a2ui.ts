/**
 * A2UI Envelope 타입 (초안 stub)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (AG-UI 계약 §, ADR-017)
 * 정식 팔레트·스키마 SSOT: interface/batdi-a2ui-palette-schema (추후)
 *
 * A2UIEnvelope 는 surfaceUpdate / dataModelUpdate / beginRendering 으로 구성된다.
 * 바인딩은 authoring 표기 `{{bind:"path"}}` → emit 시 JSON Pointer(`/path`)로 컴파일.
 *
 * ⚠️ 본 파일은 P0 골격 stub. 팔레트 화이트리스트·깊이 제한(4단계,30노드) 등
 *    런타임 검증 규칙은 @batdi/a2ui-schema 및 추후 UIValidator 에서 구현.
 */

/** A2UI 컴포넌트 노드 (화이트리스트 팔레트 — P0 stub, 구조만 정의) */
export interface A2UIComponentNode {
  /** 팔레트 컴포넌트 타입 (예: 'Card', 'Text', 'Row', 'StatGrid' …) */
  type: string;
  /** 노드 식별자 (surface 내 유일) */
  id?: string;
  /** 정적 속성 */
  props?: Record<string, unknown>;
  /** 데이터 바인딩 (authoring: `{{bind:"path"}}`, emit: JSON Pointer `/path`) */
  bindings?: Record<string, string>;
  /** 자식 노드 (깊이 제한 4단계 — 검증은 a2ui-schema) */
  children?: A2UIComponentNode[];
}

/** 렌더링 대상 표면(surface) 갱신 */
export interface SurfaceUpdate {
  kind: 'surfaceUpdate';
  /** 표면 식별자 */
  surfaceId: string;
  /** 렌더 트리 루트 */
  root: A2UIComponentNode;
}

/** 데이터 모델 갱신 — 팩트(수치)는 항상 DataBinder 경유로 여기에 주입 (LLM 리터럴 금지) */
export interface DataModelUpdate {
  kind: 'dataModelUpdate';
  surfaceId: string;
  /** JSON Pointer 경로 → 값 맵 */
  data: Record<string, unknown>;
}

/** 렌더링 시작 신호 */
export interface BeginRendering {
  kind: 'beginRendering';
  surfaceId: string;
}

/** A2UI Envelope — 위 3종 메시지의 묶음 */
export interface A2UIEnvelope {
  /** envelope 스키마 버전 */
  version: string;
  surfaceUpdate: SurfaceUpdate;
  dataModelUpdate: DataModelUpdate;
  beginRendering: BeginRendering;
}

/** AG-UI 이벤트 스트림 타입 (RunStarted/StateSnapshot/A2UIEnvelope/RunFinished) — P0 stub */
export type AgUiEventType =
  | 'RunStarted'
  | 'StateSnapshot'
  | 'A2UIEnvelope'
  | 'ToolResult'
  | 'RunFinished';
