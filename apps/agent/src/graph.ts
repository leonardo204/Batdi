/**
 * 밧디 (batdi) — Core StateGraph 골격 (ADR-016 LangGraph-over-HTTP)
 *
 * 이번 P1은 "배선(wiring) 골격"이다. CopilotKit Runtime(api:3001)이
 * LangGraphAgent(deploymentUrl=http://localhost:8123, graphId="batdi") 를 통해
 * 이 그래프를 HTTP로 호출한다.
 *
 * 키(GOOGLE_API_KEY) 없이도 라운드트립이 동작하도록:
 *   - 키 있으면 ChatGoogleGenerativeAI(gemini-2.5-flash)로 실응답
 *   - 키 없으면 캔드(canned) 응답 — "🦇 밧디(스켈레톤): {입력} 받음"
 *
 * TODO(architecture §3): 아래 골격을 다음 단계에서 확장한다.
 *   - Normalizer 노드: NFKC+자모+homoglyph+이모지 제거 (userMessageNormalized)
 *   - IntentRouter 노드: 키워드/정규식 라우팅 (LLM 미사용), 미매칭 → chat
 *   - ServiceSubgraph 분기 + CacheLookup (L0~L3)
 *   - Core State 확장: user/team/level/profile/serviceDataSummary/serviceDataRef
 */
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';

/** BaseMessage.content(string | 복합 블록)을 안전하게 평문으로 환원 */
function messageText(message: BaseMessage | undefined): string {
  if (message === undefined) {
    return '';
  }
  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }
  // 복합 콘텐츠 블록 배열 → text 블록만 이어붙임
  return content
    .map((block) => {
      if (typeof block === 'string') {
        return block;
      }
      if (block != null && typeof block === 'object' && 'text' in block) {
        const text = (block as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .join(' ')
    .trim();
}

/**
 * Core 채팅 노드 — 마지막 user 메시지를 받아 AI 응답을 생성한다.
 * (골격: 키 유무에 따라 실응답/캔드 응답으로 분기)
 */
async function chat(
  state: typeof MessagesAnnotation.State,
): Promise<Partial<typeof MessagesAnnotation.State>> {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  const userText = messageText(lastMessage);

  const apiKey = process.env.GOOGLE_API_KEY;

  // 키 없음 → 캔드 응답 (라운드트립 실증용, 비용 0)
  if (apiKey === undefined || apiKey.trim() === '') {
    const canned = `🦇 밧디(스켈레톤): "${userText}" 받음`;
    return { messages: [new AIMessage(canned)] };
  }

  // 키 있음 → Gemini 2.5 Flash 실응답
  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    apiKey,
  });
  const response = await model.invoke(messages);
  return { messages: [response] };
}

/** Core StateGraph: START → chat → END */
export const graph = new StateGraph(MessagesAnnotation)
  .addNode('chat', chat)
  .addEdge(START, 'chat')
  .addEdge('chat', END)
  .compile();
