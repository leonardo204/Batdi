/**
 * PersonalContext 노드 (P2-W6 6.3)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.5 (PersonalContext),
 *       §3.2 (CacheLookup MISS → PersonalContext → UIComposer 흐름)
 *
 * 책임:
 *  - PersonalAgent.buildContext(state.userId) 로 개인화 컨텍스트를 조립해 state.personalContext 에 보관.
 *  - 후속 노드(PromptBuilder 주입, EmitA2UI 의 L0 캐시 가드)가 이 채널을 읽는다.
 *
 * 위치: CacheLookup MISS 경로 진입점(uiComposer 직전). L0 HIT 경로(emitA2UI 직행)는
 *   완성 envelope 재사용이라 개인화 조립이 불필요하므로 이 노드를 우회한다.
 *
 * best-effort: buildContext 는 DB 비활성/없음/실패 시 중립 기본값(개인화 없음)을 반환하며
 *   절대 throw 하지 않는다 → 그래프는 DB 없이도 정상 동작한다.
 *
 * ⚠️ SSOT §4.7 의 PersonalContext || ServiceSubgraph 병렬 실행은 ServiceSubgraph(W5)
 *    도입 시 적용한다. 현재는 ServiceSubgraph 가 없어 순차로 둔다.
 */
import type { RunnableConfig } from '@langchain/core/runnables';
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import { buildContext } from '../personal/personal-agent';
import { buildConversationMemory } from '../services/memory';
import { resolveConversation } from '../personal/conversation-store';
import { resolveThreadId } from '../utils/identity';

export async function personalContext(
  state: CoreGraphState,
  config?: RunnableConfig,
): Promise<CoreGraphUpdate> {
  const ctx = await buildContext(state.userId);

  // P3-W9 9.3/9.4: thread_id 로 Conversation 을 멱등 upsert 해 conversationId 를 얻고,
  //   그 Conversation.summary 를 9.2 의 prevSessionSummary 로 흘려보낸다(영속화 gap 마감).
  //   resolveConversation 은 best-effort — 인자 누락/DB 비활성/미등록 사용자 시 null →
  //   conversationId undefined + prevSessionSummary null(이전 동작과 동일한 graceful 폴백).
  const threadId = resolveThreadId(config);
  const conversation = await resolveConversation(state.userId, threadId);
  const prevSessionSummary = conversation?.sessionSummary ?? null;

  // P3-W9 9.2: 3단계 대화 메모리 조립(working 카운트 + session 증분 요약 + long-term).
  //   best-effort — buildConversationMemory 는 키/LLM 없거나 실패해도 throw 하지 않고
  //   가능한 값으로 조립한다. 이제 prevSessionSummary 가 영속화된 Conversation.summary 다.
  const conversationMemory = await buildConversationMemory({
    messages: state.messages ?? [],
    prevSessionSummary,
    longTermSummary: ctx.profile.longTermSummary,
    config,
  });

  return {
    personalContext: ctx,
    conversationMemory,
    conversationId: conversation?.conversationId,
  };
}
