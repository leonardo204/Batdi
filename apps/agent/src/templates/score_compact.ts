/**
 * L1 결정론 템플릿 — intent=score 스코어 카드 (score_compact)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md (팔레트),
 *       Ref-docs/specs/design/batdi-architecture.md §5 (A2UI 팔레트)
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만으로 구성한다.
 * (도메인 widget 금지 — basic_catalog 외 컴포넌트는 렌더 실패 리스크)
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  (정적 타이틀 "스코어")
 *    ├ Row   (홈)  → Text {{bind:"home.name"}}, Text {{bind:"home.score"}}
 *    ├ Row   (원정)→ Text {{bind:"away.name"}}, Text {{bind:"away.score"}}
 *    ├ Text  {{bind:"inning"}}
 *    └ Text  {{llm.reaction}}  ← LLM 감정 리액션 슬롯 (P2-W6)
 *
 * authoring 표기:
 *  - `{{bind:"점.경로"}}` (DB 수치) → JSON Pointer 슬롯 `{ "path": "/점/경로" }`로 컴파일.
 *  - `{{llm.reaction}}` (LLM 감정 리액션) → 슬롯 `{ "path": "/reaction" }`로 컴파일.
 *    두 슬롯은 종류가 다르다: 수치는 DataBinder, 리액션은 EmitA2UI 가 /reaction 에 주입.
 *    ⚠️ 리액션 텍스트엔 숫자 금지 — 수치는 오직 {{bind}} 슬롯만 (CLAUDE.md).
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/**
 * score_compact 템플릿의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — 각 노드 `{ id, component, ...props, children? }`)
 */
export const SCORE_COMPACT_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: ['title', 'home_row', 'away_row', 'inning', 'reaction'],
  },
  { id: 'title', component: 'Text', text: '스코어', variant: 'h3' },
  {
    id: 'home_row',
    component: 'Row',
    justify: 'spaceBetween',
    children: ['home_name', 'home_score'],
  },
  { id: 'home_name', component: 'Text', text: bind('home.name') },
  { id: 'home_score', component: 'Text', text: bind('home.score') },
  {
    id: 'away_row',
    component: 'Row',
    justify: 'spaceBetween',
    children: ['away_name', 'away_score'],
  },
  { id: 'away_name', component: 'Text', text: bind('away.name') },
  { id: 'away_score', component: 'Text', text: bind('away.score') },
  { id: 'inning', component: 'Text', text: bind('inning'), variant: 'caption' },
  // LLM 감정 리액션 슬롯 — 값은 EmitA2UI 가 data model /reaction 에 주입.
  { id: 'reaction', component: 'Text', text: '{{llm.reaction}}', variant: 'body' },
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 스코어 데이터에서 값을 추출해 updateDataModel로 주입한다.
 */
export const SCORE_COMPACT_BIND_SCHEMA: ReadonlyArray<string> = [
  'home.name',
  'home.score',
  'away.name',
  'away.score',
  'inning',
];

/** 템플릿 식별자 */
export const SCORE_COMPACT_TEMPLATE_ID = 'score_compact' as const;
