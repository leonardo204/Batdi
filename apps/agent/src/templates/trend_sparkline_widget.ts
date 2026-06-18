/**
 * A2UI 위젯 — trendSparkline (추세)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md §5.3,
 *       Ref-docs/specs/design/batdi-architecture.md ADR-046
 *
 * ⚠️ 기본 카탈로그 근사 — 도메인 sparkline image 미등록(ADR-046).
 *   차트 컴포넌트가 없으므로 DataBinder 가 사전 포맷한 문자열(예: spark="▁▂▄▆█",
 *   summary="3.20 → 2.80")을 단일 Text 로 bind 한다. LLM 미생성(ADR-019).
 *
 * 5종 기본 컴포넌트(Text/Row/Column/Button/TextField)만으로 구성한다.
 *
 * 구조 (평탄 인접 리스트, root id="root"):
 *   Column[ root ]
 *    ├ Text  "추세" (h3, 정적)
 *    ├ Text  {{bind:"trend.type"}}    (caption, 예 "ERA")
 *    ├ Text  {{bind:"trend.spark"}}   (h4, 사전 포맷 sparkline 문자열)
 *    └ Text  {{bind:"trend.summary"}} (caption, 예 "3.20 → 2.80")
 *
 * ⚠️ 총 5노드, 깊이 2 — maxNodes=30 / maxDepth=4 게이트 내.
 */

/** authoring 바인딩 표기 헬퍼 — `{{bind:"path"}}` */
function bind(path: string): string {
  return `{{bind:"${path}"}}`;
}

/**
 * trendSparkline 의 authoring 컴포넌트 트리.
 * (평탄 인접 리스트 — root Column children = [title, type, spark, summary])
 */
export const TREND_SPARKLINE_COMPONENTS: Array<Record<string, unknown>> = [
  {
    id: 'root',
    component: 'Column',
    children: ['title', 'type_label', 'spark_text', 'summary_text'],
  },
  { id: 'title', component: 'Text', text: '추세', variant: 'h3' },
  {
    id: 'type_label',
    component: 'Text',
    text: bind('trend.type'),
    variant: 'caption',
  },
  { id: 'spark_text', component: 'Text', text: bind('trend.spark'), variant: 'h4' },
  {
    id: 'summary_text',
    component: 'Text',
    text: bind('trend.summary'),
    variant: 'caption',
  },
];

/**
 * bind 경로 목록 (점경로). DataBinder가 이 경로들을 JSON Pointer로 컴파일하고
 * 추세 데이터(사전 포맷 문자열)에서 값을 추출해 updateDataModel로 주입한다.
 */
export const TREND_SPARKLINE_BIND_SCHEMA: ReadonlyArray<string> = [
  'trend.type',
  'trend.spark',
  'trend.summary',
];

/** 위젯 식별자 */
export const TREND_SPARKLINE_WIDGET_ID = 'trend_sparkline_widget' as const;
