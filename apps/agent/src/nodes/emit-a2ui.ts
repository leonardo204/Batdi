/**
 * EmitA2UI 노드 (W2 종단)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-017/019),
 *       batdi-a2ui-palette-schema.md §5.4 (validate 실패 → L1 fallback, LLM 재호출 금지)
 *
 * 책임:
 *  1) intent → L1 템플릿 해석 (resolveTemplate)
 *  2) authoring `{{bind:"..."}}` → JSON Pointer 슬롯 컴파일 (compileBindings)
 *  3) 팩트 데이터 모델 준비 (getStubDataModel — W2 stub)
 *  4) createSurface/updateComponents/updateDataModel ops 빌드 + validateBatdiA2UI 검증
 *     - valid  → state.a2uiEnvelope = ops
 *     - invalid→ 최소 Text 카드 폴백 (LLM 재호출 금지)
 *     - /reaction 슬롯에는 state.reaction(TeamPersona 생성 → OutputGuardrail 검증값)을 주입.
 *       리액션 생성은 더 이상 이 노드에서 하지 않는다(W6 분리). 미설정 시 '' 폴백.
 *  5) **messages에 AIMessage도 반환** (기존 채팅 E2E 유지)
 *     - score: "롯데 5 : 두산 3 (7회말)" 텍스트
 *     - chat : Gemini 실응답(키 있음) 또는 캔드 응답(키 없음)
 *
 * ⚠️ a2uiEnvelope는 state에 빌드·보관만 한다. 렌더러로의 transport는 W2-B 범위.
 */
import { AIMessage } from '@langchain/core/messages';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import type { RunnableConfig } from '@langchain/core/runnables';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import { resolveTemplate } from '../templates/registry';
import {
  compileBindings,
  getStubDataModel,
  getStubScoreData,
  scoreSummaryText,
} from '../databind/compile';
import {
  buildA2UIOps,
  BATDI_SURFACE_ID,
  type BuildA2UIResult,
} from '../databind/emit';
import { getLangfuseHandler } from '../utils/langfuse';

/**
 * A2UI 렌더 툴 이름 (ADR-020). 백엔드 a2ui 미들웨어의 a2uiToolNames 기본값과 일치해야
 * 미들웨어가 이 툴콜의 args(surfaceId/components/data)를 읽어 `a2ui-surface`로 렌더한다.
 */
const RENDER_A2UI_TOOL_NAME = 'render_a2ui';

/**
 * @ag-ui/langgraph CustomEventNames.ManuallyEmitToolCall 값.
 * 노드가 이 커스텀 이벤트를 dispatch 하면 어댑터가 스트리밍
 * TOOL_CALL_START(name) → TOOL_CALL_ARGS(args 문자열) → TOOL_CALL_END 을 방출한다.
 * (값은 @ag-ui/langgraph d.ts 의 enum 과 일치 — 의존성 추가 없이 리터럴 사용)
 */
const MANUALLY_EMIT_TOOL_CALL = 'manually_emit_tool_call';

/**
 * A2UI 폴백 발생 시 관측 신호.
 * SSOT: palette-schema §5.4(2)/ADR-019 — 검증 실패 페이로드는 `llm_ui_invalid`
 * 이벤트로 비동기 기록해야 한다.
 * TODO(W2-B/Langfuse): console.warn → Langfuse `llm_ui_invalid` 비동기 로깅으로 교체.
 *   현재는 폴백이 silent 하게 삼켜지지 않도록 최소 흔적만 남긴다.
 */
function reportA2UIResult(stage: string, result: BuildA2UIResult): void {
  if (result.usedFallback) {
    // eslint-disable-next-line no-console
    console.warn(
      `[emit-a2ui] ${stage}: A2UI 검증 실패 → L1 폴백 사용`,
      result.errors.map((e) => e.code),
    );
  }
}

/**
 * render_a2ui 툴콜을 **스트리밍 이벤트**로 방출한다 (ADR-020 Path C).
 *
 * 노드가 만든 AIMessage.tool_calls 는 스냅샷(MESSAGES_SNAPSHOT)으로만 전달돼
 * 미들웨어의 surface 빌드(TOOL_CALL_START/ARGS 의존)를 트리거하지 못한다(헤드리스 SSE
 * 실측). 대신 manually_emit_tool_call 커스텀 이벤트를 dispatch 하면 @ag-ui/langgraph
 * 어댑터가 TOOL_CALL_START/ARGS/END 를 방출 → a2ui 미들웨어가 args 로 surface 렌더.
 * args 는 delta(문자열)로 흘러가므로 JSON.stringify 한다.
 * tool_call id 는 run 당 단일 surface 라 안정 상수(Date/random 미사용).
 */
async function emitRenderA2UIToolCall(
  result: BuildA2UIResult,
  config: RunnableConfig | undefined,
): Promise<void> {
  await dispatchCustomEvent(
    MANUALLY_EMIT_TOOL_CALL,
    {
      id: `render-${BATDI_SURFACE_ID}`,
      name: RENDER_A2UI_TOOL_NAME,
      args: JSON.stringify({
        surfaceId: BATDI_SURFACE_ID,
        components: result.components,
        data: result.data,
      }),
    },
    config,
  );
}

/** chat intent 응답 텍스트 (Gemini 실응답 또는 캔드 폴백) */
async function chatResponseText(state: CoreGraphState): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    return `🦇 밧디(스켈레톤): "${state.userMessage}" 받음`;
  }
  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    apiKey,
  });
  // Langfuse 트레이싱(1.5): 키 있으면 CallbackHandler 주입 → generation·토큰·비용 기록.
  const handler = getLangfuseHandler();
  const response = await model.invoke(
    state.messages,
    handler ? { callbacks: [handler] } : undefined,
  );
  const content = response.content;
  return typeof content === 'string' ? content : JSON.stringify(content);
}

export async function emitA2UI(
  state: CoreGraphState,
  config?: RunnableConfig,
): Promise<CoreGraphUpdate> {
  // ── W4: 입력 가드레일 차단 분기 ──
  // graph 조건부 엣지로 intentRouter~outputGuardrail 을 우회해 직접 진입한 경우.
  // LLM/템플릿 호출 없이 fallbackResponse 를 단일 Text 카드 + AIMessage 로 방출.
  if (state.inputGuardrailResult?.pass === false) {
    const blockedText =
      state.inputGuardrailResult.fallbackResponse ??
      '그런 얘기는 좀 그런 거 같아유~ 즐겁게 야구 얘기 하자!';
    const result = buildA2UIOps(
      [{ id: 'root', component: 'Text', text: blockedText }],
      {},
      blockedText,
    );
    reportA2UIResult(
      `guardrail-blocked(${state.inputGuardrailResult.violationType ?? 'unknown'})`,
      result,
    );
    return {
      a2uiEnvelope: result.ops,
      messages: [new AIMessage(blockedText)],
    };
  }

  const template = resolveTemplate(state.intent);

  // ── 템플릿 있음 (W2: score) ──
  if (template) {
    const compiled = compileBindings(template.components);

    const summary =
      state.intent === 'score'
        ? scoreSummaryText(getStubScoreData())
        : '응답';

    // P2-W6: 리액션은 TeamPersona 가 생성하고 OutputGuardrail 이 검증·정제한 값을
    // state.reaction 으로 받아 data model /reaction 에 주입한다(카드 reaction 슬롯 표시).
    // score 외 경로/차단 시엔 미설정(undefined) → 빈 문자열로 폴백(슬롯 비표시).
    const data = {
      ...getStubDataModel(state.intent),
      reaction: state.reaction ?? '',
    };

    const result = buildA2UIOps(compiled, data, summary);
    reportA2UIResult(`intent=${state.intent}`, result);

    // W2-B (ADR-020 Path C): render_a2ui 툴콜을 스트리밍 이벤트로 방출 →
    // a2ui 미들웨어가 surface 렌더. 카드 자체가 응답이므로 별도 메시지는 두지 않는다
    // (요약 reaction 텍스트는 W2 범위 밖). a2uiEnvelope 는 state 디버그 채널로만 보관.
    await emitRenderA2UIToolCall(result, config);

    return {
      a2uiEnvelope: result.ops,
    };
  }

  // ── 템플릿 없음 (chat/meme 등) → 텍스트-only + 단일 Text 카드 ──
  const text = await chatResponseText(state);
  const result = buildA2UIOps(
    [{ id: 'root', component: 'Text', text }],
    {},
    text,
  );
  reportA2UIResult(`intent=${state.intent}(no-template)`, result);

  return {
    a2uiEnvelope: result.ops,
    messages: [new AIMessage(text)],
  };
}
