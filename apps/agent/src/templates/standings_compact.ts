/**
 * L1 결정론 템플릿 — intent=stats 팀 순위 카드 (standings_compact)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md (팔레트),
 *       Ref-docs/specs/design/batdi-architecture.md §5 (A2UI 팔레트)
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만으로 구성한다.
 * (List 등 도메인 widget 금지 — basic_catalog 외 컴포넌트는 렌더 실패 리스크)
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  (정적 타이틀 "팀 순위")
 *    ├ Text  {{bind:"rows.0.line"}}  ← 1위 팀 한 줄
 *    ├ Text  {{bind:"rows.1.line"}}
 *    ├ …
 *    └ Text  {{bind:"rows.9.line"}}  ← 10위 팀 한 줄
 *
 * ⚠️ 총 12노드(root + title + 10줄), 깊이 2 — maxNodes=30 / maxDepth=4 게이트 내(넉넉).
 *    10팀을 Row×4셀 표로 만들면 50+노드라 초과되므로, **한 팀당 단일 Text 줄**
 *    (StatsGraph.formatStandingsLine 으로 미리 포맷된 문자열)로 구성한다.
 *
 * authoring 표기:
 *  - `{{bind:"rows.N.line"}}` (DB 수치 포함 문자열) → JSON Pointer 슬롯 `{ "path": "/rows/N/line" }`
 *    로 컴파일(compileBindings: 점 → 슬래시). 값은 DataBinder 가 updateDataModel 로 주입.
 *  - ⚠️ standings 는 LLM 감정 리액션을 생성하지 않으므로 `{{llm.reaction}}` 슬롯이 없다.
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/** 순위 줄 개수 (DB take 10 과 일치 — 10팀) */
const ROW_COUNT = 10;

/** rowN 노드의 id (row0..row9) */
function rowId(n: number): string {
  return `row${n}`;
}

/**
 * standings_compact 템플릿의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, row0..row9])
 */
export const STANDINGS_COMPACT_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: ['title', ...Array.from({ length: ROW_COUNT }, (_, n) => rowId(n))],
  },
  { id: 'title', component: 'Text', text: '팀 순위', variant: 'h3' },
  ...Array.from({ length: ROW_COUNT }, (_, n) => ({
    id: rowId(n),
    component: 'Text',
    text: bind(`rows.${n}.line`),
  })),
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 순위 데이터에서 값을 추출해 updateDataModel로 주입한다.
 *   rows.0.line .. rows.9.line
 */
export const STANDINGS_COMPACT_BIND_SCHEMA: ReadonlyArray<string> =
  Array.from({ length: ROW_COUNT }, (_, n) => `rows.${n}.line`);

/** 템플릿 식별자 */
export const STANDINGS_COMPACT_TEMPLATE_ID = 'standings_compact' as const;
