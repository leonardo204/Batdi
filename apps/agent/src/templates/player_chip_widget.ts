/**
 * A2UI 위젯 — playerChipWidget (선수 칩)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md §5.3,
 *       Ref-docs/specs/design/batdi-architecture.md ADR-046
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만으로 구성한다.
 * (palette §5.3 의 chip 도메인 컴포넌트는 프론트 미등록 → 기본 카탈로그 조합 근사)
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Row[ root ] (align:'center')
 *    ├ Text {{bind:"player.name"}}      (h4)
 *    ├ Text {{bind:"player.position"}}  (caption)
 *    ├ Text {{bind:"player.number"}}    (caption)
 *    └ Text {{bind:"player.team"}}      (caption)
 *
 * ⚠️ 총 5노드(root + 4 Text), 깊이 2 — maxNodes=30 / maxDepth=4 게이트 내.
 *
 * authoring 표기:
 *  - `{{bind:"player.path"}}` (DB 값) → JSON Pointer 슬롯 `{ "path": "/player/path" }`.
 *    값은 DataBinder 가 updateDataModel 로 주입. LLM 리터럴 값 금지(ADR-019).
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/**
 * playerChipWidget 의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Row children = [name, position, number, team])
 */
export const PLAYER_CHIP_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Row',
    align: 'center',
    children: ['name', 'position', 'number', 'team'],
  },
  { id: 'name', component: 'Text', text: bind('player.name'), variant: 'h4' },
  {
    id: 'position',
    component: 'Text',
    text: bind('player.position'),
    variant: 'caption',
  },
  {
    id: 'number',
    component: 'Text',
    text: bind('player.number'),
    variant: 'caption',
  },
  { id: 'team', component: 'Text', text: bind('player.team'), variant: 'caption' },
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 선수 데이터에서 값을 추출해 updateDataModel로 주입한다.
 */
export const PLAYER_CHIP_BIND_SCHEMA: ReadonlyArray<string> = [
  'player.name',
  'player.team',
  'player.position',
  'player.number',
];

/** 위젯 식별자 */
export const PLAYER_CHIP_WIDGET_ID = 'player_chip_widget' as const;
