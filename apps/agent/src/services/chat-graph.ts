/**
 * ChatGraph 서비스 (P3-W8 8.1 — chat intent 페르소나 대화)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §9.1 (XML 프롬프트 조립),
 *       §3.2 (생성 → OutputGuardrail 흐름),
 *       batdi-persona-guardrail.md §6.3 (출력 가드레일),
 *       CLAUDE.md "UIValidator 실패 시 LLM 재호출 금지"
 *
 * 책임:
 *  - chat intent(no-template 경로)의 응답 텍스트를 **페르소나 + PersonalContext +
 *    출력 가드레일 + 팀톤 폴백**을 갖춰 생성한다(기존 맨 Gemini 호출/스켈레톤 stub 교체).
 *  - GOOGLE_API_KEY 없으면 → 팀톤 캔드 폴백(stub 금지).
 *  - 키 있으면 → buildChatPrompt(XML system_base/personal_profile/team_persona)로
 *    시스템 프롬프트를 조립해 Gemini Flash(thinking OFF)로 1~3문장 생성.
 *  - 생성 텍스트는 출력 가드레일(toNormalizedForm → checkOutputGuardrail)로 재검증한다.
 *    위반(일베/비속어) 시 안전 캔드 문구로 교체(LLM 재호출 금지 — UIValidator 원칙 일관).
 *  - LLM 오류/빈 응답 → 팀톤 캔드 폴백(try/catch, throw 금지 — best-effort).
 *
 * ⚠️ chat 응답은 LLM 비결정이라 L0 캐시 write 하지 않는다(현 동작 유지 — emit-a2ui).
 */
import { SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { CoreGraphState } from '../state';
import { buildChatPrompt, cannedReactionFor } from '../utils/prompt-builder';
import { checkOutputGuardrail } from '../nodes/input-guardrail';
import { toNormalizedForm } from '../nodes/normalizer';
import { getLangfuseHandler } from '../utils/langfuse';
import {
  extractFrontendActions,
  type FrontendAction,
} from './frontend-actions';

/** LLM 이 tool_call 없이 액션만 트리거했을 때의 짧은 확인 문구. */
const ACTION_ACK_TEXT = '요청 처리할게요!';

/**
 * 대화 맥락으로 LLM 에 전달할 최근 메시지 개수 상한.
 * 너무 길면 토큰/레이턴시가 늘고 thinking OFF + 256토큰 출력과 균형이 안 맞는다.
 * 최근 N개만 전달(시스템 프롬프트가 페르소나/규칙을 담으므로 긴 이력 불필요).
 */
const RECENT_MESSAGES_LIMIT = 8;

/**
 * 출력 가드레일 위반 시 교체할 안전 캔드 문구.
 * checkOutputGuardrail 의 fallbackResponse(비속어/일베용)와 동일 톤이지만,
 * chat 은 팀톤 캔드를 앞세워 자연스럽게 교체한다(LLM 재호출 금지).
 */
function safeFallbackFor(teamId: CoreGraphState['teamId']): string {
  return cannedReactionFor(teamId);
}

/**
 * 생성된 chat 응답 텍스트에 출력 가드레일을 적용한다(순수 함수, 테스트 직접 호출용).
 *
 * SSOT §6.3: LLM 출력도 IlbeMimFilter + SafetyFilter 통과. 위반 시 LLM 재호출 없이
 * 즉시 팀톤 캔드로 교체한다(UIValidator 원칙 — 레이턴시 우선).
 *
 * @param text   LLM 원본 응답(trim 전/후 무관)
 * @param teamId 폴백 톤 선택용
 * @returns 통과면 원본(trim), 위반/빈 응답이면 팀톤 캔드
 */
export function applyOutputGuardrail(
  text: string,
  teamId: CoreGraphState['teamId'],
): string {
  const trimmed = text.trim();
  if (trimmed === '') {
    return safeFallbackFor(teamId); // 빈 응답 방어 → 캔드 폴백
  }
  const normalized = toNormalizedForm(trimmed);
  const result = checkOutputGuardrail(normalized);
  if (!result.pass) {
    // 일베/비속어 검출 → 안전 캔드로 교체(LLM 재호출 금지).
    return safeFallbackFor(teamId);
  }
  return trimmed;
}

/** BaseMessage.content(string | parts) → 평문 문자열 */
function contentToText(content: BaseMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/** AIMessage.tool_calls 의 한 항목(@langchain ToolCall, 느슨한 형태 방어). */
interface LangChainToolCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

/**
 * chat 응답 결과(P4-W10 10.1). text 는 표시용, toolCalls 는 LLM 이 호출한 프론트 액션.
 * toolCalls 가 있으면 emit 노드가 **구조화된 tool_calls 를 가진 AIMessage** 를 messages 에
 * 실어 CopilotKit 클라이언트가 getTool(name).handler 를 실행하게 한다(ADR-050).
 */
export interface ChatReplyResult {
  text: string;
  toolCalls: LangChainToolCall[];
}

/**
 * 프론트엔드 액션을 LLM bindTools 형태로 변환한다.
 * (OpenAI/Gemini 호환 function 스키마 — @langchain bindTools 가 그대로 수용)
 */
function toBoundTools(actions: FrontendAction[]): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return actions.map((a) => ({
    type: 'function',
    function: {
      name: a.name,
      description: a.description,
      parameters: a.parameters,
    },
  }));
}

/**
 * chat intent 응답 텍스트를 생성한다(페르소나 + PersonalContext + 출력 가드레일).
 *
 * best-effort: GOOGLE_API_KEY 없음/LLM 오류/빈 응답/가드레일 위반 → 팀톤 캔드 폴백.
 * 절대 throw 하지 않는다(emit-a2ui 가 단일 Text 카드로 방출).
 *
 * @returns 항상 비어있지 않은 응답 문자열
 */
export async function generateChatReply(
  state: CoreGraphState,
  config?: RunnableConfig,
): Promise<ChatReplyResult> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    // 키 없음 → 팀톤 캔드 폴백(스켈레톤 stub 금지).
    return { text: cannedReactionFor(state.teamId), toolCalls: [] };
  }

  try {
    const systemPrompt = buildChatPrompt({
      teamId: state.teamId,
      userMessage: state.userMessage,
      // P2-W6 6.3: 개인화 컨텍스트 — 개인화 정보 있을 때만 personal_profile 블록 추가.
      personalContext: state.personalContext,
      // P3-W9 9.2: 대화 메모리 — session/long-term 요약 있을 때만 conversation_memory 블록 추가.
      conversationMemory: state.conversationMemory,
    });
    const baseModel = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
      // gemini-2.5-flash 는 thinking 모델 — 짧은 대화엔 추론이 불필요하다.
      // thinkingBudget:0 으로 thinking 을 끄지 않으면 maxOutputTokens 가 reasoning
      // 토큰에 소진돼 답변이 잘린다. chat 은 1~3문장이라 256토큰이면 충분.
      maxOutputTokens: 256,
      thinkingConfig: { thinkingBudget: 0 },
    });

    // ── P4-W10 10.1: 프론트엔드 액션 바인딩(ADR-050) ──
    // CopilotKit 클라이언트가 보낸 액션(state.tools)이 있으면 그 function 스키마를
    // bindTools 해 LLM 이 tool_call 을 낼 수 있게 한다. 액션 없음/키 없음/오류 →
    // 기존 동작(텍스트 응답, 회귀 0). 바인딩은 LLM 호출 직전에만 수행한다.
    const frontendActions = extractFrontendActions(state);
    const model =
      frontendActions.length > 0
        ? baseModel.bindTools(toBoundTools(frontendActions))
        : baseModel;

    // 최근 N개 대화 이력만 전달(시스템 프롬프트가 페르소나/규칙 담당).
    const recent = state.messages.slice(-RECENT_MESSAGES_LIMIT);
    const handler = getLangfuseHandler();
    const callbacks = handler ? [handler] : undefined;
    const response = await model.invoke(
      [new SystemMessage(systemPrompt), ...recent],
      callbacks ? { ...config, callbacks } : config,
    );

    // ── tool_call 처리(ADR-050) ──
    // LLM 이 바인딩된 프론트 액션을 호출하기로 했다면, **구조화된 tool_calls** 를 결과로
    // 반환한다. emit 노드가 이를 tool_calls 를 가진 AIMessage 로 messages 에 실어주면
    // CopilotKit 클라이언트(processAgentResult)가 message.toolCalls 를 읽어 getTool(name)
    // .handler 를 실행한다(→ /api/favorites/register). ⚠️ 서버는 액션을 실행하지 않는다.
    // (manually_emit_tool_call 은 A2UI 미들웨어 surface 빌드 전용이라 프론트 액션 실행을
    //  트리거하지 못한다 — 헤드리스 e2e 실측. 액션은 메시지 스냅샷 toolCalls 경로로 실행.)
    const toolCalls = (response.tool_calls ?? []) as LangChainToolCall[];
    if (toolCalls.length > 0) {
      const llmText = contentToText(response.content).trim();
      // content 가 functionCall 배열 직렬화일 수 있어, 액션 시엔 깔끔한 확인 문구를 쓴다.
      const text =
        llmText !== '' && !llmText.startsWith('[{')
          ? applyOutputGuardrail(llmText, state.teamId)
          : ACTION_ACK_TEXT;
      return { text, toolCalls };
    }

    // 출력 가드레일(빈 응답/일베/비속어 방어 — 위반 시 캔드 교체).
    return {
      text: applyOutputGuardrail(contentToText(response.content), state.teamId),
      toolCalls: [],
    };
  } catch {
    // LLM 호출 실패 → 팀톤 캔드로 graceful(전체 응답 실패 금지).
    return { text: cannedReactionFor(state.teamId), toolCalls: [] };
  }
}
