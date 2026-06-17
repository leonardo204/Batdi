/**
 * L1 결정론 템플릿 — intent=score 스코어 카드 (score_emphasized, 최종 결과 대형 강조)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md (팔레트),
 *       Ref-docs/specs/design/batdi-architecture.md §5 (A2UI 팔레트)
 *
 * score_compact/score_default 와 동일한 bind 경로(home.name/home.score/away.name/
 * away.score/inning) + `{{llm.reaction}}` 슬롯을 사용하되, 종료(FINISHED) 경기의
 * 최종 점수를 대형(h1)으로 강조하는 레이아웃이다.
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만으로 구성한다.
 * (도메인 widget 금지 — basic_catalog 외 컴포넌트는 렌더 실패 리스크)
 *
 * 구조 (평탄 인접 리스트, root id="root", depth ≤ 4 / nodes ≤ 30):
 *   Column[ root ]
 *    ├ Text (정적 타이틀 "경기 결과" h2)
 *    ├ Row  [ score_row, justify=spaceBetween ]   (depth 2)
 *    │   ├ Row [ home_block ]  → Text home_name(h3), Text home_score(h1)  (depth 3 → 4)
 *    │   ├ Text (정적 "vs" caption)
 *    │   └ Row [ away_block ]  → Text away_name(h3), Text away_score(h1)
 *    ├ Text {{bind:"inning"}} (caption)
 *    └ Text {{llm.reaction}} (body)  ← LLM 감정 리액션 슬롯
 *
 * 노드 12개, 최대 깊이 4(root → score_row → home_block → home_name). 게이트 내.
 *
 * authoring 표기:
 *  - `{{bind:"점.경로"}}` (DB 수치) → JSON Pointer 슬롯 `{ "path": "/점/경로" }`로 컴파일.
 *  - `{{llm.reaction}}` (LLM 감정 리액션) → 슬롯 `{ "path": "/reaction" }`로 컴파일.
 *    ⚠️ 리액션 텍스트엔 숫자 금지 — 수치는 오직 {{bind}} 슬롯만 (CLAUDE.md).
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/**
 * score_emphasized 템플릿의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — 각 노드 `{ id, component, ...props, children? }`)
 */
export const SCORE_EMPHASIZED_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: ['title', 'score_row', 'inning', 'reaction'],
  },
  { id: 'title', component: 'Text', text: '경기 결과', variant: 'h2' },
  {
    id: 'score_row',
    component: 'Row',
    justify: 'spaceBetween',
    children: ['home_block', 'vs', 'away_block'],
  },
  {
    id: 'home_block',
    component: 'Row',
    children: ['home_name', 'home_score'],
  },
  { id: 'home_name', component: 'Text', text: bind('home.name'), variant: 'h3' },
  { id: 'home_score', component: 'Text', text: bind('home.score'), variant: 'h1' },
  // 정적 구분자 — 홈/원정 사이 "vs"
  { id: 'vs', component: 'Text', text: 'vs', variant: 'caption' },
  {
    id: 'away_block',
    component: 'Row',
    children: ['away_name', 'away_score'],
  },
  { id: 'away_name', component: 'Text', text: bind('away.name'), variant: 'h3' },
  { id: 'away_score', component: 'Text', text: bind('away.score'), variant: 'h1' },
  { id: 'inning', component: 'Text', text: bind('inning'), variant: 'caption' },
  // LLM 감정 리액션 슬롯 — 값은 EmitA2UI 가 data model /reaction 에 주입.
  { id: 'reaction', component: 'Text', text: '{{llm.reaction}}', variant: 'body' },
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 스코어 데이터에서 값을 추출해 updateDataModel로 주입한다.
 * (score_compact/score_default 와 동일 — 세 score 템플릿은 동일 데이터 계약)
 */
export const SCORE_EMPHASIZED_BIND_SCHEMA: ReadonlyArray<string> = [
  'home.name',
  'home.score',
  'away.name',
  'away.score',
  'inning',
];

/** 템플릿 식별자 */
export const SCORE_EMPHASIZED_TEMPLATE_ID = 'score_emphasized' as const;
