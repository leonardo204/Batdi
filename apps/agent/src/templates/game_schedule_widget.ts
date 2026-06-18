/**
 * A2UI 위젯 — gameScheduleWidget (경기 일정)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md §5.3,
 *       Ref-docs/specs/design/batdi-architecture.md ADR-046
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만으로 구성한다.
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  "경기 일정" (h3, 정적)
 *    ├ Text  {{bind:"game.date"}}  (caption)
 *    ├ Row   matchup (justify:'center') → Text home, Text "vs", Text away
 *    ├ Text  {{bind:"game.venue"}} (caption)
 *    └ Text  {{bind:"game.time"}}  (caption)
 *
 * ⚠️ 총 9노드, 깊이 3 — maxNodes=30 / maxDepth=4 게이트 내.
 *
 * authoring 표기:
 *  - `{{bind:"game.path"}}` (DB 값) → JSON Pointer 슬롯. 정적 라벨("경기 일정","vs")만 하드코딩.
 *    값은 DataBinder 가 updateDataModel 로 주입. LLM 리터럴 값 금지(ADR-019).
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/**
 * gameScheduleWidget 의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, date, matchup, venue, time])
 */
export const GAME_SCHEDULE_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: ['title', 'date_text', 'matchup_row', 'venue_text', 'time_text'],
  },
  { id: 'title', component: 'Text', text: '경기 일정', variant: 'h3' },
  {
    id: 'date_text',
    component: 'Text',
    text: bind('game.date'),
    variant: 'caption',
  },
  {
    id: 'matchup_row',
    component: 'Row',
    justify: 'center',
    children: ['home_name', 'vs_label', 'away_name'],
  },
  { id: 'home_name', component: 'Text', text: bind('game.home'), variant: 'body' },
  { id: 'vs_label', component: 'Text', text: 'vs', variant: 'caption' },
  { id: 'away_name', component: 'Text', text: bind('game.away'), variant: 'body' },
  {
    id: 'venue_text',
    component: 'Text',
    text: bind('game.venue'),
    variant: 'caption',
  },
  {
    id: 'time_text',
    component: 'Text',
    text: bind('game.time'),
    variant: 'caption',
  },
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 경기 일정 데이터에서 값을 추출해 updateDataModel로 주입한다.
 */
export const GAME_SCHEDULE_BIND_SCHEMA: ReadonlyArray<string> = [
  'game.date',
  'game.home',
  'game.away',
  'game.venue',
  'game.time',
];

/** 위젯 식별자 */
export const GAME_SCHEDULE_WIDGET_ID = 'game_schedule_widget' as const;
