/**
 * L1 결정론 템플릿 — intent=lineup 라인업 타순 (lineup_compact)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md (팔레트),
 *       Ref-docs/specs/design/batdi-architecture.md ADR-047, §5 (A2UI 팔레트)
 *
 * standings_compact 와 동일 패턴(평탄 Column + 미리 포맷된 단일 Text 줄). 타순 1~9번을
 * 각 한 줄씩 보여준다. 각 줄은 DataBinder 가 사전 포맷한 문자열(예: "1번 (중) 홍길동")이다.
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만 사용. List 등 도메인 widget 금지.
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  (정적 타이틀 "라인업", h3)
 *    ├ Text  {{bind:"team"}}        (caption)  ← 팀명
 *    ├ Text  {{bind:"rows.0.line"}} (body)     ← 1번 타자
 *    ├ …
 *    └ Text  {{bind:"rows.8.line"}} (body)     ← 9번 타자
 *
 * ⚠️ 총 12노드(root + title + team + 9타순), 깊이 2 — maxNodes=30 / maxDepth=4 게이트 내.
 *
 * authoring 표기:
 *  - `{{bind:"team"}}` / `{{bind:"rows.N.line"}}` (사전 포맷 문자열) → JSON Pointer 슬롯.
 *    값은 (LineupGraph 도입 시) updateDataModel 로 주입. LLM 미생성(ADR-019).
 *  - ⚠️ 라인업은 LLM 감정 리액션을 생성하지 않으므로 `{{llm.reaction}}` 슬롯이 없다.
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/** 타순 줄 개수 (1~9번) */
const ROW_COUNT = 9;

/** batN 노드의 id (bat0..bat8) */
function batId(n: number): string {
  return `bat${n}`;
}

/**
 * lineup_compact 템플릿의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, team_text, bat0..bat8])
 */
export const LINEUP_COMPACT_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: [
      'title',
      'team_text',
      ...Array.from({ length: ROW_COUNT }, (_, n) => batId(n)),
    ],
  },
  { id: 'title', component: 'Text', text: '라인업', variant: 'h3' },
  { id: 'team_text', component: 'Text', text: bind('team'), variant: 'caption' },
  ...Array.from({ length: ROW_COUNT }, (_, n) => ({
    id: batId(n),
    component: 'Text',
    text: bind(`rows.${n}.line`),
    variant: 'body',
  })),
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 라인업 데이터(사전 포맷 문자열)에서 값을 추출해 주입한다.
 *   team, rows.0.line .. rows.8.line
 */
export const LINEUP_COMPACT_BIND_SCHEMA: ReadonlyArray<string> = [
  'team',
  ...Array.from({ length: ROW_COUNT }, (_, n) => `rows.${n}.line`),
];

/** 템플릿 식별자 */
export const LINEUP_COMPACT_TEMPLATE_ID = 'lineup_compact' as const;
