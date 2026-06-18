/**
 * L1 결정론 템플릿 — intent=meme 오늘의 밈 카드 (meme_card, card variant)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md (팔레트),
 *       Ref-docs/specs/design/batdi-architecture.md ADR-047, §5 (A2UI 팔레트),
 *       ADR-038 (MemeGraph)
 *
 * MemeGraph(ADR-038)가 고른 밈 1건을 카드로 보여준다. 카테고리(응원/드립)와 콘텐츠 문자열은
 * memes 테이블의 정적 콘텐츠로, DataBinder 가 그대로 bind 한다(LLM 생성 아님 — ADR-019).
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만 사용. List 등 도메인 widget 금지.
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  (정적 타이틀 "오늘의 밈", h3)
 *    ├ Text  {{bind:"meme.category"}} (caption)  ← 응원/드립
 *    └ Text  {{bind:"meme.content"}}  (body)     ← 밈 콘텐츠
 *
 * ⚠️ 총 4노드(root + title + category + content), 깊이 2 — maxNodes=30 / maxDepth=4 게이트 내.
 *
 * authoring 표기:
 *  - `{{bind:"meme.path"}}` (memes DB 정적 콘텐츠) → JSON Pointer 슬롯 `{ "path": "/meme/path" }`.
 *    값은 MemeGraph 가 updateDataModel 로 주입. LLM 리터럴 값 금지(ADR-019).
 *  - ⚠️ 밈 카드는 LLM 감정 리액션을 생성하지 않으므로 `{{llm.reaction}}` 슬롯이 없다.
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/**
 * meme_card 템플릿의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, category_text, content_text])
 */
export const MEME_CARD_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: ['title', 'category_text', 'content_text'],
  },
  { id: 'title', component: 'Text', text: '오늘의 밈', variant: 'h3' },
  {
    id: 'category_text',
    component: 'Text',
    text: bind('meme.category'),
    variant: 'caption',
  },
  {
    id: 'content_text',
    component: 'Text',
    text: bind('meme.content'),
    variant: 'body',
  },
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 밈 데이터(memes 테이블 정적 콘텐츠)에서 값을 추출해 주입한다.
 *   meme.category, meme.content
 */
export const MEME_CARD_BIND_SCHEMA: ReadonlyArray<string> = [
  'meme.category',
  'meme.content',
];

/** 템플릿 식별자 */
export const MEME_CARD_TEMPLATE_ID = 'meme_card' as const;
