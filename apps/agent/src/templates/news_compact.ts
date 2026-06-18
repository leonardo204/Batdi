/**
 * L1 결정론 템플릿 — intent=news KBO 뉴스 리스트 (news_compact)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md (팔레트),
 *       Ref-docs/specs/design/batdi-architecture.md ADR-047, §5 (A2UI 팔레트)
 *
 * standings_compact 와 동일 패턴(평탄 Column + 미리 포맷된 단일 Text 줄). 최신 뉴스 5건을
 * 각 한 줄씩 보여준다. 각 줄은 DataBinder 가 사전 포맷한 "제목 — 출처 · 시간" 문자열이다.
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만 사용. List 등 도메인 widget 금지.
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  (정적 타이틀 "KBO 뉴스", h3)
 *    ├ Text  {{bind:"rows.0.line"}}  (body)  ← 1번째 뉴스 ("제목 — 출처 · 시간")
 *    ├ …
 *    └ Text  {{bind:"rows.4.line"}}  (body)  ← 5번째 뉴스
 *
 * ⚠️ 총 7노드(root + title + 5줄), 깊이 2 — maxNodes=30 / maxDepth=4 게이트 내(넉넉).
 *
 * authoring 표기:
 *  - `{{bind:"rows.N.line"}}` (사전 포맷 문자열) → JSON Pointer 슬롯 `{ "path": "/rows/N/line" }`.
 *    값은 (NewsGraph 도입 시) news.rows 를 updateDataModel 로 주입. LLM 미생성(ADR-019).
 *  - ⚠️ 뉴스는 LLM 감정 리액션을 생성하지 않으므로 `{{llm.reaction}}` 슬롯이 없다.
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/** 뉴스 줄 개수 (최신 5건) */
const ROW_COUNT = 5;

/** rowN 노드의 id (row0..row4) */
function rowId(n: number): string {
  return `row${n}`;
}

/**
 * news_compact 템플릿의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, row0..row4])
 */
export const NEWS_COMPACT_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: ['title', ...Array.from({ length: ROW_COUNT }, (_, n) => rowId(n))],
  },
  { id: 'title', component: 'Text', text: 'KBO 뉴스', variant: 'h3' },
  ...Array.from({ length: ROW_COUNT }, (_, n) => ({
    id: rowId(n),
    component: 'Text',
    text: bind(`rows.${n}.line`),
    variant: 'body',
  })),
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 뉴스 데이터(사전 포맷 "제목 — 출처 · 시간" 문자열)에서 값을 추출해 주입한다.
 *   rows.0.line .. rows.4.line
 */
export const NEWS_COMPACT_BIND_SCHEMA: ReadonlyArray<string> =
  Array.from({ length: ROW_COUNT }, (_, n) => `rows.${n}.line`);

/** 템플릿 식별자 */
export const NEWS_COMPACT_TEMPLATE_ID = 'news_compact' as const;
