/**
 * L1 결정론 템플릿 — intent=stats 팀 순위 카드 (standings_emphasized, 상위권 강조)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md (팔레트),
 *       Ref-docs/specs/design/batdi-architecture.md ADR-047, §5 (A2UI 팔레트)
 *
 * standings_compact 와 **동일 bindSchema**(rows.0.line..rows.9.line) — emit data 계약 공유.
 * 차이는 레이아웃뿐: 상위 3팀(row0/1/2)을 h4 로 키워 강조하고 나머지는 body 로 둔다.
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만으로 구성한다.
 * (List 등 도메인 widget 금지 — basic_catalog 외 컴포넌트는 렌더 실패 리스크)
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  (정적 타이틀 "팀 순위 TOP", h3)
 *    ├ Text  {{bind:"rows.0.line"}}  (h4)  ← 1위 강조
 *    ├ Text  {{bind:"rows.1.line"}}  (h4)  ← 2위 강조
 *    ├ Text  {{bind:"rows.2.line"}}  (h4)  ← 3위 강조
 *    ├ Text  {{bind:"rows.3.line"}}  (body)
 *    ├ …
 *    └ Text  {{bind:"rows.9.line"}}  (body)
 *
 * ⚠️ 총 12노드(root + title + 10줄), 깊이 2 — maxNodes=30 / maxDepth=4 게이트 내(넉넉).
 *
 * authoring 표기:
 *  - `{{bind:"rows.N.line"}}` (DB 수치 포함 문자열) → JSON Pointer 슬롯 `{ "path": "/rows/N/line" }`.
 *    값은 EmitA2UI 가 standings.rows 를 updateDataModel 로 주입(standings_compact 와 동일 경로).
 *  - ⚠️ standings 는 LLM 감정 리액션을 생성하지 않으므로 `{{llm.reaction}}` 슬롯이 없다.
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/** 순위 줄 개수 (DB take 10 과 일치 — 10팀) */
const ROW_COUNT = 10;

/** 상위권 강조(h4) 줄 개수 (상위 3팀) */
const EMPHASIZED_COUNT = 3;

/** rowN 노드의 id (row0..row9) */
function rowId(n: number): string {
  return `row${n}`;
}

/**
 * standings_emphasized 템플릿의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, row0..row9])
 */
export const STANDINGS_EMPHASIZED_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: ['title', ...Array.from({ length: ROW_COUNT }, (_, n) => rowId(n))],
  },
  { id: 'title', component: 'Text', text: '팀 순위 TOP', variant: 'h3' },
  ...Array.from({ length: ROW_COUNT }, (_, n) => ({
    id: rowId(n),
    component: 'Text',
    text: bind(`rows.${n}.line`),
    variant: n < EMPHASIZED_COUNT ? 'h4' : 'body',
  })),
];

/**
 * bind 경로 목록 (점경로). standings_compact 와 동일 — 동일 데이터 계약을 공유한다.
 *   rows.0.line .. rows.9.line
 */
export const STANDINGS_EMPHASIZED_BIND_SCHEMA: ReadonlyArray<string> =
  Array.from({ length: ROW_COUNT }, (_, n) => `rows.${n}.line`);

/** 템플릿 식별자 */
export const STANDINGS_EMPHASIZED_TEMPLATE_ID = 'standings_emphasized' as const;
