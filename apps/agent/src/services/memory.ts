/**
 * Memory 서비스 (P3-W9 9.2 — 3단계 대화 컨텍스트 메모리)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.5 (메모리/PersonalContext),
 *       Ref-docs/specs/impl/batdi-development-plan.md 9.2 (3단계 메모리)
 *
 * 3단계 메모리 매핑:
 *  1. Working memory(20건): state.messages(MessagesAnnotation, CopilotKit 라운드트립)의
 *     최근 WORKING_MEMORY_LIMIT 개. chat-graph 가 이미 state.messages.slice 로 LLM 에 넣으므로,
 *     이 서비스는 working 메시지 자체가 아니라 프롬프트 주입용 요약/카운트만 메모리 객체에 담는다.
 *  2. Session 요약(Flash-Lite, 증분): working 상한을 초과한 오래된(overflow) 메시지를
 *     gemini-2.5-flash-lite 로 한 단락 증분 요약한다(이전 요약 + 넘친 메시지 → 갱신 요약).
 *     ⚠️ 현 단계는 DB 영속화 없이 per-request 인메모리 계산이다(conversationId 가 state 에
 *        없어 Message/Conversation.summary 영속화는 범위 외 — 9.4 에서 배선).
 *  3. Long-term profile: PersonalAgentState.profileSummary(DB). buildContext 가 읽어
 *     PersonalContext.profile.longTermSummary 로 노출하며, 여기선 그 값을 주입용으로만 받는다.
 *
 * 안전 속성(best-effort): 모든 LLM 경로는 GOOGLE_API_KEY 없음/오류/빈 응답 시 이전 요약
 *   (prevSummary)으로 graceful 폴백한다. 절대 throw 하지 않는다(그래프는 키 없이도 정상 동작).
 *   요약은 개인화 단서(응원팀/관심선수/말투/관심사) 위주 1~2문장이며, 수치·기록을 새로
 *   지어내지 않는다(환각 금지 — 프롬프트로 강제).
 */
import { SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { getLangfuseHandler } from '../utils/langfuse';

/**
 * Working memory 상한(건). 최근 N개를 LLM 에 직접 전달하고, 그 이전(overflow)은 요약한다.
 * 너무 길면 토큰/레이턴시가 늘어 thinking OFF + 짧은 출력과 균형이 안 맞는다.
 */
export const WORKING_MEMORY_LIMIT = 20;

/**
 * 프롬프트 주입용 대화 메모리 묶음(per-request 인메모리).
 *  - workingMessages 자체는 chat-graph 가 state.messages.slice 로 LLM 에 직접 넣으므로
 *    여기엔 담지 않고, 카운트(workingMessageCount)와 요약(session/long-term)만 담는다.
 */
export interface ConversationMemory {
  /** working memory 에 포함된 최근 메시지 개수(최대 WORKING_MEMORY_LIMIT) */
  workingMessageCount: number;
  /** 세션(overflow) 증분 요약 — 넘친 메시지가 없거나 요약 실패 시 이전 값(없으면 null) */
  sessionSummary: string | null;
  /** 장기 프로필 요약(PersonalAgentState.profileSummary, 세션 간 학습 결과). 없으면 null */
  longTermSummary: string | null;
}

/** summarizeOverflow 의 증분 요약 시스템 지시(개인화 단서 위주, 환각 금지) */
const SUMMARY_SYSTEM_DIRECTIVE = `너는 대화 메모리 요약기다.
아래 이전 요약(있으면)과 새 대화 조각을 합쳐, 사용자에 대해 기억할 만한 개인화 단서를
1~2문장으로 갱신 요약하라.
- 우선 담을 것: 응원팀, 관심 선수, 말투·호칭 선호, 관심사(관전 포인트 등).
- 절대 금지: 점수·기록·날짜 등 수치를 새로 지어내지 마라(없으면 쓰지 마라).
- 한국어 한 단락(머리말·따옴표 없이 내용만).`;

/**
 * 최근 WORKING_MEMORY_LIMIT 개를 working, 그 이전을 overflow 로 분리한다(순수 함수).
 * 메시지가 상한 이하면 overflow 는 빈 배열, working 은 전체.
 *
 * @param messages state.messages(MessagesAnnotation)
 * @returns { working, overflow }
 */
export function selectWorkingMemory(messages: BaseMessage[]): {
  working: BaseMessage[];
  overflow: BaseMessage[];
} {
  const list = messages ?? [];
  if (list.length <= WORKING_MEMORY_LIMIT) {
    return { working: list.slice(), overflow: [] };
  }
  const splitAt = list.length - WORKING_MEMORY_LIMIT;
  return {
    working: list.slice(splitAt),
    overflow: list.slice(0, splitAt),
  };
}

/** BaseMessage.content(string | parts) → 평문 문자열 */
function contentToText(content: BaseMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/**
 * overflow(넘친 오래된 메시지)를 이전 요약과 합쳐 증분 요약한다(best-effort).
 *
 *  - overflow 가 비면 prevSummary 를 그대로 반환(요약할 새 내용 없음).
 *  - GOOGLE_API_KEY 없음/LLM 오류/빈 응답 → prevSummary 반환(throw 금지).
 *  - 키 있으면 gemini-2.5-flash-lite(thinking OFF, maxOutputTokens 256)로 한 단락 요약.
 *
 * @param overflow     working 상한을 초과한 오래된 메시지
 * @param prevSummary  이전 세션 요약(없으면 null)
 * @param config       LangGraph RunnableConfig(트레이싱 전파용)
 * @returns 갱신된 요약 문자열 또는 prevSummary(폴백)
 */
export async function summarizeOverflow(
  overflow: BaseMessage[],
  prevSummary: string | null,
  config?: RunnableConfig,
): Promise<string | null> {
  if (!overflow || overflow.length === 0) {
    return prevSummary;
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    // 키 없음 → 증분 불가, 이전 요약 유지(best-effort).
    return prevSummary;
  }

  try {
    const overflowText = overflow
      .map((m) => contentToText(m.content).trim())
      .filter((t) => t !== '')
      .join('\n');
    const prevBlock =
      prevSummary && prevSummary.trim() !== ''
        ? `<previous_summary>\n${prevSummary.trim()}\n</previous_summary>\n\n`
        : '';
    const systemPrompt = `${SUMMARY_SYSTEM_DIRECTIVE}

${prevBlock}<new_dialogue>
${overflowText}
</new_dialogue>`;

    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash-lite',
      apiKey,
      // flash-lite 도 thinking 모델 — 짧은 요약엔 추론 불필요. thinkingBudget:0 으로
      // 끄지 않으면 maxOutputTokens 가 reasoning 토큰에 소진돼 요약이 잘린다.
      maxOutputTokens: 256,
      thinkingConfig: { thinkingBudget: 0 },
    });

    const handler = getLangfuseHandler();
    const callbacks = handler ? [handler] : undefined;
    const response = await model.invoke(
      [new SystemMessage(systemPrompt)],
      callbacks ? { ...config, callbacks } : config,
    );

    const trimmed = contentToText(response.content).trim();
    // 빈 응답 방어 → 이전 요약 유지(요약 누락 방지).
    return trimmed === '' ? prevSummary : trimmed;
  } catch {
    // LLM 호출 실패 → 이전 요약 유지(전체 응답 실패 금지 — best-effort).
    return prevSummary;
  }
}

/**
 * 대화 메모리(working 카운트 + session/long-term 요약)를 조립한다(best-effort).
 *
 * 흐름: selectWorkingMemory 로 working/overflow 분리 → overflow 있으면 summarizeOverflow 로
 *   증분 요약 → ConversationMemory 조립. overflow 가 없으면 sessionSummary=prevSessionSummary.
 *
 * @returns ConversationMemory (실패해도 throw 하지 않고 가능한 값으로 조립)
 */
export async function buildConversationMemory(input: {
  messages: BaseMessage[];
  prevSessionSummary: string | null;
  longTermSummary: string | null;
  config?: RunnableConfig;
}): Promise<ConversationMemory> {
  const { messages, prevSessionSummary, longTermSummary, config } = input;
  const { working, overflow } = selectWorkingMemory(messages ?? []);
  const sessionSummary =
    overflow.length > 0
      ? await summarizeOverflow(overflow, prevSessionSummary, config)
      : prevSessionSummary;

  return {
    workingMessageCount: working.length,
    sessionSummary,
    longTermSummary,
  };
}
