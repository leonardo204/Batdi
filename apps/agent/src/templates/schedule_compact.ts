/**
 * L1 결정론 템플릿 — intent=schedule 오늘의 경기 일정 (schedule_compact)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md (팔레트),
 *       Ref-docs/specs/design/batdi-architecture.md ADR-047, §5 (A2UI 팔레트)
 *
 * standings_compact 와 동일 패턴(평탄 Column + 미리 포맷된 단일 Text 줄). 하루 최대 5경기를
 * 각 한 줄씩 보여준다. 각 줄은 DataBinder 가 사전 포맷한 경기 문자열(예: "롯데 vs 두산 18:30 사직")이다.
 * (gameScheduleWidget 은 단일 경기 상세, 본 템플릿은 멀티게임 리스트로 역할이 다르다.)
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만 사용. List 등 도메인 widget 금지.
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  (정적 타이틀 "오늘의 경기", h3)
 *    ├ Text  {{bind:"date"}}        (caption)  ← 날짜
 *    ├ Text  {{bind:"rows.0.line"}} (body)     ← 1번째 경기
 *    ├ …
 *    └ Text  {{bind:"rows.4.line"}} (body)     ← 5번째 경기
 *
 * ⚠️ 총 8노드(root + title + date + 5경기), 깊이 2 — maxNodes=30 / maxDepth=4 게이트 내.
 *
 * authoring 표기:
 *  - `{{bind:"date"}}` / `{{bind:"rows.N.line"}}` (사전 포맷 문자열) → JSON Pointer 슬롯.
 *    값은 (ScheduleGraph 도입 시) updateDataModel 로 주입. LLM 미생성(ADR-019).
 *  - ⚠️ 일정은 LLM 감정 리액션을 생성하지 않으므로 `{{llm.reaction}}` 슬롯이 없다.
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/** 경기 줄 개수 (하루 최대 5경기) */
const ROW_COUNT = 5;

/** gameN 노드의 id (game0..game4) */
function gameId(n: number): string {
  return `game${n}`;
}

/**
 * schedule_compact 템플릿의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, date_text, game0..game4])
 */
export const SCHEDULE_COMPACT_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: [
      'title',
      'date_text',
      ...Array.from({ length: ROW_COUNT }, (_, n) => gameId(n)),
    ],
  },
  { id: 'title', component: 'Text', text: '오늘의 경기', variant: 'h3' },
  { id: 'date_text', component: 'Text', text: bind('date'), variant: 'caption' },
  ...Array.from({ length: ROW_COUNT }, (_, n) => ({
    id: gameId(n),
    component: 'Text',
    text: bind(`rows.${n}.line`),
    variant: 'body',
  })),
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 경기 일정 데이터(사전 포맷 문자열)에서 값을 추출해 주입한다.
 *   date, rows.0.line .. rows.4.line
 */
export const SCHEDULE_COMPACT_BIND_SCHEMA: ReadonlyArray<string> = [
  'date',
  ...Array.from({ length: ROW_COUNT }, (_, n) => `rows.${n}.line`),
];

/** 템플릿 식별자 */
export const SCHEDULE_COMPACT_TEMPLATE_ID = 'schedule_compact' as const;
