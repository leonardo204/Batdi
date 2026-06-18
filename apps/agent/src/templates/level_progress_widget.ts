/**
 * A2UI 위젯 — levelProgressWidget (레벨 진척)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md §5.3,
 *       Ref-docs/specs/design/batdi-architecture.md ADR-046
 *
 * ⚠️ 기본 카탈로그 근사 — 도메인 progress bar 미등록(ADR-046).
 *   progress bar 컴포넌트가 없으므로 DataBinder 가 사전 포맷한 문자열(예: bar="███░░ 60%",
 *   xp="1200 / 2000 XP")을 단일 Text 로 bind 한다. LLM 미생성(ADR-019).
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만으로 구성한다.
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  "레벨" (h3, 정적)
 *    ├ Row   level_row (justify:'spaceBetween') → Text "현재 레벨", Text {{bind:"level.currentLevel"}}
 *    ├ Text  {{bind:"level.bar"}} (body, 사전 포맷 progress 문자열)
 *    └ Text  {{bind:"level.xp"}}  (caption)
 *
 * ⚠️ 총 7노드, 깊이 3 — maxNodes=30 / maxDepth=4 게이트 내.
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/**
 * levelProgressWidget 의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, level_row, bar, xp])
 */
export const LEVEL_PROGRESS_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: ['title', 'level_row', 'bar_text', 'xp_text'],
  },
  { id: 'title', component: 'Text', text: '레벨', variant: 'h3' },
  {
    id: 'level_row',
    component: 'Row',
    justify: 'spaceBetween',
    children: ['level_label', 'level_value'],
  },
  { id: 'level_label', component: 'Text', text: '현재 레벨', variant: 'caption' },
  {
    id: 'level_value',
    component: 'Text',
    text: bind('level.currentLevel'),
    variant: 'h4',
  },
  { id: 'bar_text', component: 'Text', text: bind('level.bar'), variant: 'body' },
  { id: 'xp_text', component: 'Text', text: bind('level.xp'), variant: 'caption' },
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 레벨 데이터(사전 포맷 문자열 포함)에서 값을 추출해 updateDataModel로 주입한다.
 */
export const LEVEL_PROGRESS_BIND_SCHEMA: ReadonlyArray<string> = [
  'level.currentLevel',
  'level.bar',
  'level.xp',
];

/** 위젯 식별자 */
export const LEVEL_PROGRESS_WIDGET_ID = 'level_progress_widget' as const;
