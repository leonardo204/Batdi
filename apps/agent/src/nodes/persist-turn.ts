/**
 * PersistTurn 노드 (P3-W9 9.3/9.4 — 턴 영속화 종단)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.2 (노드 흐름),
 *       Ref-docs/specs/interface/batdi-db-schema.md A그룹(messages)·B그룹(personal_agent_state)
 *
 * 위치: emitA2UI → persistTurnNode → END. 모든 응답 경로(차단/L0 HIT/composite/score/
 *   stats/meme/chat)가 emitA2UI 로 수렴하므로, 이 한 곳에서 1회 영속화하면 전부 커버된다.
 *
 * 책임(전부 best-effort — state 변경 없음, 절대 throw 금지):
 *  1) conversationId 있으면 user/assistant Message 2건 insert + Conversation touch(persistTurn).
 *  2) userId 있으면 PersonalAgentState.messageCount write-through 증분(bumpMessageCount).
 *
 * assistantText 는 마지막 AIMessage 텍스트(messageText). score/stats 카드 경로엔 AIMessage 가
 *   없을 수 있어(카드만 방출) 빈 문자열을 허용한다(Message.content 는 NOT NULL 이라 ''로 저장).
 */
import type { BaseMessage } from '@langchain/core/messages';
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import { messageText } from '../utils/message-text';
import {
  persistTurn,
  bumpMessageCount,
  updateLevelProgress,
} from '../personal/conversation-store';

/** messages 에서 마지막 AIMessage(어시스턴트) 텍스트를 추출한다(없으면 ''). */
function lastAssistantText(messages: BaseMessage[]): string {
  const lastAi = [...messages]
    .reverse()
    .find((m) => m.getType() === 'ai');
  return lastAi ? messageText(lastAi) : '';
}

export async function persistTurnNode(
  state: CoreGraphState,
): Promise<CoreGraphUpdate> {
  // 1) 대화/메시지 영속화 — conversationId 가 배선됐을 때만(미배선/익명/미등록 시 skip).
  if (
    state.conversationId !== undefined &&
    state.conversationId.trim() !== ''
  ) {
    await persistTurn({
      conversationId: state.conversationId,
      userText: state.userMessage ?? '',
      assistantText: lastAssistantText(state.messages ?? []),
      a2uiEnvelope: state.a2uiEnvelope,
    });
  }

  // 2) messageCount write-through — userId 가 있을 때만(best-effort, FK 위반 시 내부 null).
  //    이어서 XP/level 멱등 recompute(10.3). messageCount 가 먼저 갱신돼야 turns 가 최신이다.
  if (
    typeof state.userId === 'string' &&
    state.userId.trim() !== ''
  ) {
    await bumpMessageCount(state.userId);
    // leveledUp 결과는 현재 사용처 없음(11.2 레벨업 푸시 후속) — best-effort, state 미변경.
    await updateLevelProgress(state.userId);
  }

  // state 변경 없음(영속화는 부수효과). 응답 envelope/messages 는 emitA2UI 가 이미 확정.
  return {};
}
