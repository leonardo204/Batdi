/**
 * L3 UIComposer 서비스 (P3-W9 9.1)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §4 (L3 Full),
 *       Ref-docs/specs/interface/batdi-a2ui-palette-schema.md §5.4(UIValidator 게이트),
 *       Ref-docs/specs/interface/batdi-routing.md §2 (composite)
 *
 * 책임:
 *  - composite(복합) 질의에 대해 LLM(Gemini Flash)이 A2UI spec(components + data model)을
 *    **동적 생성**한다. 단일 intent 정형 카드(L1 템플릿)로는 한 화면에 담기 어려운, 서로 다른
 *    데이터(score + 순위/리더보드)를 한 surface 로 합성하는 것이 목적.
 *  - 생성 책임만 진다. **검증은 호출부(emit-a2ui)가 buildA2UIOps → validateBatdiA2UI 게이트로**
 *    수행한다(maxDepth4/maxNodes30/카탈로그/바인딩). 게이트 실패 시 호출부가 L1 즉시 폴백한다
 *    (재호출 금지, ADR-019).
 *
 * 안전 속성:
 *  - GOOGLE_API_KEY 없음/LLM 오류/파싱 실패/빈 응답 → null(폴백 신호). 절대 throw 하지 않는다.
 *  - 수치(팩트)는 반드시 제공된 data 값을 그대로 쓰도록 프롬프트로 강제(창작 금지). 값 슬롯은
 *    data model `{path}` 바인딩 또는 정적 라벨만 허용(기본 카탈로그 5종).
 *  - 카탈로그는 기본 5종(Text/Row/Column/Button/TextField)만. root id="root", 깊이≤4/노드≤30.
 *
 * ⚠️ composite/L3 응답은 LLM 비결정이라 L0 캐시 write 금지(호출부에서 write 생략).
 */
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { CoreGraphState } from '../state';
import { getLangfuseHandler } from '../utils/langfuse';

/** L3 합성 결과 — 검증 전 raw components + data model. 검증은 호출부 게이트가 수행. */
export interface ComposeL3Result {
  components: Array<Record<string, unknown>>;
  data: Record<string, unknown>;
}

/**
 * 사용 가능한 정형 데이터를 LLM 프롬프트용 JSON 으로 수집한다(순수 함수).
 *  - score: { home, away, inning } (수치 포함 — LLM 은 이 값을 data 에 그대로 싣고 components 가 참조)
 *  - standings: { rows: [{ line }] } (미리 포맷된 순위 줄)
 *  - playerStats: { kind, rows: [{ line }] } (미리 포맷된 리더보드 줄)
 * 데이터가 하나도 없으면 빈 객체.
 */
export function collectAvailableData(
  state: CoreGraphState,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (state.scoreData) {
    data.score = {
      home: state.scoreData.home,
      away: state.scoreData.away,
      inning: state.scoreData.inning,
    };
  }
  if (state.standingsData) {
    data.standings = { rows: state.standingsData.rows };
  }
  if (state.playerStats) {
    data.playerStats = {
      kind: state.playerStats.kind,
      rows: state.playerStats.rows,
    };
  }
  return data;
}

/**
 * A2UI 동적 생성 시스템 프롬프트(palette-schema 제약을 LLM 에 강하게 지시).
 * 제공 데이터(availableData)는 그대로 data model 에 싣고, components 가 `{path}` 로 참조하게 한다.
 */
function buildComposePrompt(availableData: Record<string, unknown>): string {
  return [
    '너는 KBO 야구 챗봇 "밧디"의 A2UI 화면 합성기다.',
    '사용자의 복합 질의에 대해 아래 제공 데이터를 한 화면에 담는 A2UI spec(JSON)을 만든다.',
    '',
    '## 출력 형식 (오직 JSON 객체 하나만, 코드펜스/설명 금지)',
    '{ "components": [...], "data": {...} }',
    '',
    '## components 규칙 (엄수 — 위반 시 폐기됨)',
    '- 평탄(flat) 인접 리스트. 각 노드는 { "id", "component", ...props, "children"? }.',
    '- root 노드의 id 는 반드시 "root".',
    '- 사용 가능한 component 는 5종뿐: Text, Row, Column, Button, TextField.',
    '  · Text: { "component":"Text", "text": "..." 또는 {"path":"/..."} }',
    '  · Row/Column: { "component":"Row|Column", "children": ["자식id", ...] }',
    '- 트리 깊이 4 이하, 전체 노드 30개 이하. (초과 금지 — 간결하게.)',
    '- 다른 component(Card/ScoreCard 등)·다른 prop 키 금지.',
    '',
    '## data 규칙 (팩트 무결성 — 절대 위반 금지)',
    '- 수치(점수/순위/타율 등)는 반드시 아래 "제공 데이터" 값을 그대로 data 에 넣는다.',
    '- 숫자를 새로 지어내거나 바꾸지 않는다(창작 금지). 모르면 그 항목을 빼라.',
    '- components 의 값 슬롯은 정적 라벨(예: "스코어") 또는 data 경로 바인딩 {"path":"/score/home/score"}.',
    '- 어린이 보호: 비속어/혐오/성인 표현 금지. 친근한 응원 톤만.',
    '',
    '## 제공 데이터 (이 값만 사용)',
    JSON.stringify(availableData),
  ].join('\n');
}

/**
 * 모델 응답 텍스트에서 첫 JSON 객체를 관대하게 파싱한다(코드펜스 제거 → 첫 { … } 추출).
 * 파싱 실패/형식 불일치 → null.
 */
export function parseComposeResponse(text: string): ComposeL3Result | null {
  if (typeof text !== 'string' || text.trim() === '') {
    return null;
  }
  // 코드펜스(```json … ```) 제거.
  const fenceStripped = text
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  // 첫 '{' ~ 마지막 '}' 슬라이스(설명 텍스트가 앞뒤에 붙어도 관대 파싱).
  const start = fenceStripped.indexOf('{');
  const end = fenceStripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const slice = fenceStripped.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return null;
  }

  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { components?: unknown }).components)
  ) {
    return null;
  }
  const obj = parsed as {
    components: unknown[];
    data?: unknown;
  };
  const components = obj.components as Array<Record<string, unknown>>;
  if (components.length === 0) {
    return null; // 빈 components → 폴백
  }
  const data =
    obj.data !== null && typeof obj.data === 'object'
      ? (obj.data as Record<string, unknown>)
      : {};
  return { components, data };
}

/**
 * composite 질의에 대해 LLM 으로 A2UI spec 을 동적 생성한다.
 *
 * @returns { components, data } — 생성 성공(파싱 성공) 시. 키 없음/오류/파싱 실패/빈 응답 → null.
 *   (검증은 호출부 emit-a2ui 가 buildA2UIOps 게이트로 수행. 여기서 검증하지 않는다.)
 */
export async function composeL3(
  state: CoreGraphState,
  config?: RunnableConfig,
): Promise<ComposeL3Result | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    return null; // 키 없음 → 폴백 신호(L1 대표 intent 템플릿)
  }

  const availableData = collectAvailableData(state);
  // 합성할 데이터가 하나도 없으면 LLM 호출 의미 없음 → 폴백.
  if (Object.keys(availableData).length === 0) {
    return null;
  }

  try {
    const systemPrompt = buildComposePrompt(availableData);
    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
      // gemini-2.5-flash 는 thinking 모델 — 구조 생성엔 약간의 추론 여지를 두되(256),
      // 출력 토큰은 A2UI spec JSON 을 충분히 담도록 1024 로 둔다(잘림 방지).
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 256 },
    });
    const handler = getLangfuseHandler();
    const response = await model.invoke(
      [
        new SystemMessage(systemPrompt),
        new HumanMessage(state.userMessage ?? ''),
      ],
      handler ? { callbacks: [handler] } : undefined,
    );
    const content = response.content;
    const text =
      typeof content === 'string' ? content : JSON.stringify(content);
    return parseComposeResponse(text);
  } catch {
    // LLM 호출 실패 → null(L1 폴백). 절대 throw 하지 않는다.
    return null;
  }
}
