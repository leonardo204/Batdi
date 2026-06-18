/**
 * A2UI 위젯 — headToHeadWidget (맞대결 비교)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md §5.3,
 *       Ref-docs/specs/design/batdi-architecture.md ADR-046
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만으로 구성한다.
 * (palette §5.3 의 grid 도메인 컴포넌트는 프론트 미등록 → 기본 카탈로그 조합 근사)
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  "맞대결" (h3, 정적)
 *    ├ Row   header (justify:'spaceBetween') → Text a_name(h4), Text "vs", Text b_name(h4)
 *    └ Row   statRow{n} (justify:'spaceBetween') × 3 → Text a, Text label, Text b
 *
 * ⚠️ 총 18노드(root+title + header(1+3) + 3×(1+3)), 깊이 3 — 게이트 내(넉넉).
 *
 * authoring 표기:
 *  - `{{bind:"h2h.path"}}` (DB 값) → JSON Pointer 슬롯. 정적 라벨("맞대결","vs")만 하드코딩.
 *    값은 DataBinder 가 updateDataModel 로 주입. LLM 리터럴 값 금지(ADR-019).
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/** 스탯 비교 행 개수 (standings_compact 의 Array.from 패턴 차용) */
const ROW_COUNT = 3;

/** statRow{n} 노드의 id (statRow0..statRow2) */
function statRowId(n: number): string {
  return `statRow${n}`;
}

/**
 * headToHeadWidget 의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, header_row, statRow0..statRow2])
 */
export const HEAD_TO_HEAD_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: [
      'title',
      'header_row',
      ...Array.from({ length: ROW_COUNT }, (_, n) => statRowId(n)),
    ],
  },
  { id: 'title', component: 'Text', text: '맞대결', variant: 'h3' },
  {
    id: 'header_row',
    component: 'Row',
    justify: 'spaceBetween',
    children: ['a_name', 'header_vs', 'b_name'],
  },
  { id: 'a_name', component: 'Text', text: bind('h2h.playerA.name'), variant: 'h4' },
  { id: 'header_vs', component: 'Text', text: 'vs', variant: 'caption' },
  { id: 'b_name', component: 'Text', text: bind('h2h.playerB.name'), variant: 'h4' },
  ...Array.from({ length: ROW_COUNT }, (_, n) => ({
    id: statRowId(n),
    component: 'Row',
    justify: 'spaceBetween',
    children: [`s${n}_a`, `s${n}_label`, `s${n}_b`],
  })),
  ...Array.from({ length: ROW_COUNT }, (_, n) => [
    {
      id: `s${n}_a`,
      component: 'Text',
      text: bind(`h2h.rows.${n}.a`),
      variant: 'body',
    },
    {
      id: `s${n}_label`,
      component: 'Text',
      text: bind(`h2h.rows.${n}.label`),
      variant: 'caption',
    },
    {
      id: `s${n}_b`,
      component: 'Text',
      text: bind(`h2h.rows.${n}.b`),
      variant: 'body',
    },
  ]).flat(),
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 맞대결 데이터에서 값을 추출해 updateDataModel로 주입한다.
 */
export const HEAD_TO_HEAD_BIND_SCHEMA: ReadonlyArray<string> = [
  'h2h.playerA.name',
  'h2h.playerB.name',
  ...Array.from({ length: ROW_COUNT }, (_, n) => [
    `h2h.rows.${n}.a`,
    `h2h.rows.${n}.label`,
    `h2h.rows.${n}.b`,
  ]).flat(),
];

/** 위젯 식별자 */
export const HEAD_TO_HEAD_WIDGET_ID = 'head_to_head_widget' as const;
