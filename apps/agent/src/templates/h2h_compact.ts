/**
 * L1 결정론 템플릿 — intent=h2h 팀 상대전적 카드 (h2h_compact, ADR-057)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md (팔레트),
 *       Ref-docs/specs/design/batdi-architecture.md ADR-057, §5 (A2UI 팔레트)
 *
 * standings_compact / news_compact 와 동일 패턴(평탄 Column + 미리 포맷된 단일 Text 줄).
 * 특정 팀의 상대 9팀 전적을 각 한 줄씩 보여준다. 각 줄은 HeadToHeadGraph 가 사전 포맷한
 * "vs {상대} {W}승{L}패{D}무" 문자열이다.
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만 사용. List 등 도메인 widget 금지.
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  (정적 타이틀 "상대전적", h3)
 *    ├ Text  {{bind:"rows.0.line"}}  (body)  ← 1번째 상대 ("vs SSG 8승1패0무")
 *    ├ …
 *    └ Text  {{bind:"rows.8.line"}}  (body)  ← 9번째 상대
 *
 * ⚠️ 총 11노드(root + title + 9줄), 깊이 2 — maxNodes=30 / maxDepth=4 게이트 내(넉넉).
 *
 * authoring 표기:
 *  - `{{bind:"rows.N.line"}}` (사전 포맷 문자열) → JSON Pointer 슬롯 `{ "path": "/rows/N/line" }`.
 *    값은 HeadToHeadGraph 의 rows 를 updateDataModel 로 주입. LLM 미생성(ADR-019).
 *  - ⚠️ 상대전적은 LLM 감정 리액션을 생성하지 않으므로 `{{llm.reaction}}` 슬롯이 없다.
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/** 상대전적 줄 개수 (상대 9팀 — fetchHeadToHead take 9 와 일치) */
const ROW_COUNT = 9;

/** rowN 노드의 id (row0..row8) */
function rowId(n: number): string {
  return `row${n}`;
}

/**
 * h2h_compact 템플릿의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, row0..row8])
 */
export const HEAD_TO_HEAD_COMPACT_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: ['title', ...Array.from({ length: ROW_COUNT }, (_, n) => rowId(n))],
  },
  { id: 'title', component: 'Text', text: '상대전적', variant: 'h3' },
  ...Array.from({ length: ROW_COUNT }, (_, n) => ({
    id: rowId(n),
    component: 'Text',
    text: bind(`rows.${n}.line`),
    variant: 'body',
  })),
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 상대전적 데이터(사전 포맷 "vs {상대} {W}승{L}패{D}무" 문자열)에서 값을 추출해 주입한다.
 *   rows.0.line .. rows.8.line
 */
export const HEAD_TO_HEAD_COMPACT_BIND_SCHEMA: ReadonlyArray<string> =
  Array.from({ length: ROW_COUNT }, (_, n) => `rows.${n}.line`);

/** 템플릿 식별자 */
export const HEAD_TO_HEAD_COMPACT_TEMPLATE_ID = 'h2h_compact' as const;
