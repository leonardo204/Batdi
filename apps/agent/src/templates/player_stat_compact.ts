/**
 * L1 결정론 템플릿 — intent=stats / statType=player 팀 선수 리더보드 카드
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md (팔레트),
 *       Ref-docs/specs/design/batdi-architecture.md §5 (A2UI 팔레트)
 *
 * standings_compact 와 동일 패턴(평탄 Column + 미리 포맷된 단일 Text 줄). "타율"·"방어율"
 * 류 질의에 팀 상위 선수 6명을 한 줄씩 보여준다(StatsGraph.formatBattingLine/PitchingLine).
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만 사용. List 등 도메인 widget 금지.
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  (정적 타이틀 "선수 기록")
 *    ├ Text  {{bind:"rows.0.line"}}  ← 1위 선수 한 줄
 *    ├ …
 *    └ Text  {{bind:"rows.5.line"}}  ← 6위 선수 한 줄
 *
 * ⚠️ 총 8노드(root + title + 6줄), 깊이 2 — maxNodes=30 / maxDepth=4 게이트 내(넉넉).
 *
 * authoring 표기:
 *  - `{{bind:"rows.N.line"}}` (DB 수치 포함 문자열) → JSON Pointer 슬롯 `{ "path": "/rows/N/line" }`.
 *    값은 EmitA2UI 가 playerStats.rows 를 updateDataModel 로 주입.
 *  - ⚠️ player 리더보드도 LLM 감정 리액션을 생성하지 않으므로 `{{llm.reaction}}` 슬롯이 없다.
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/** 리더보드 줄 개수 (DB take 6 과 일치 — 상위 6명) */
const ROW_COUNT = 6;

/** rowN 노드의 id (row0..row5) */
function rowId(n: number): string {
  return `row${n}`;
}

/**
 * player_stat_compact 템플릿의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, row0..row5])
 */
export const PLAYER_STAT_COMPACT_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: ['title', ...Array.from({ length: ROW_COUNT }, (_, n) => rowId(n))],
  },
  { id: 'title', component: 'Text', text: '선수 기록', variant: 'h3' },
  ...Array.from({ length: ROW_COUNT }, (_, n) => ({
    id: rowId(n),
    component: 'Text',
    text: bind(`rows.${n}.line`),
  })),
];

/**
 * bind 경로 목록 (점경로). EmitA2UI 가 이 경로들을 JSON Pointer 로 컴파일하고
 * 리더보드 데이터에서 값을 추출해 updateDataModel 로 주입한다.
 *   rows.0.line .. rows.5.line
 */
export const PLAYER_STAT_COMPACT_BIND_SCHEMA: ReadonlyArray<string> =
  Array.from({ length: ROW_COUNT }, (_, n) => `rows.${n}.line`);

/** 템플릿 식별자 */
export const PLAYER_STAT_COMPACT_TEMPLATE_ID = 'player_stat_compact' as const;
