/**
 * personalContext 노드 — 9.2 prevSessionSummary 영속화 gap 마감 테스트 (P3-W9 9.3/9.4)
 *
 * thread_id + userId 가 주어지면:
 *  1) resolveConversation(state.userId, threadId) 로 Conversation 을 멱등 upsert 한다.
 *  2) 그 sessionSummary 가 buildConversationMemory 의 prevSessionSummary 로 흐른다
 *     (이전엔 null 하드코딩이던 자리를 영속화된 Conversation.summary 로 교체).
 *  3) conversationId 가 state 로 반환되어 persistTurnNode 가 쓸 수 있게 된다.
 * resolveConversation 이 null(미배선/익명) 이면 conversationId undefined + prevSessionSummary null.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunnableConfig } from '@langchain/core/runnables';

const { buildContextMock, resolveConversationMock, buildMemoryMock } =
  vi.hoisted(() => ({
    buildContextMock: vi.fn(),
    resolveConversationMock: vi.fn(),
    buildMemoryMock: vi.fn(),
  }));

vi.mock('../src/personal/personal-agent', () => ({
  buildContext: buildContextMock,
}));
vi.mock('../src/personal/conversation-store', () => ({
  resolveConversation: resolveConversationMock,
}));
vi.mock('../src/services/memory', () => ({
  buildConversationMemory: buildMemoryMock,
}));

import { personalContext } from '../src/nodes/personal-context';
import type { CoreGraphState } from '../src/state';

const NEUTRAL_CTX = {
  profile: { longTermSummary: 'long-term-x' },
};

beforeEach(() => {
  vi.clearAllMocks();
  buildContextMock.mockResolvedValue(NEUTRAL_CTX);
  buildMemoryMock.mockResolvedValue({ workingCount: 0, sessionSummary: null });
});

function state(partial: Partial<CoreGraphState>): CoreGraphState {
  return { messages: [], userId: 'user-1', ...partial } as CoreGraphState;
}

const cfg: RunnableConfig = { configurable: { thread_id: 'thread-1' } };

describe('personalContext prevSessionSummary 흐름', () => {
  it('resolveConversation.sessionSummary → buildConversationMemory.prevSessionSummary', async () => {
    resolveConversationMock.mockResolvedValue({
      conversationId: 'conv-1',
      sessionSummary: '지난 대화 요약',
    });

    const out = await personalContext(state({}), cfg);

    expect(resolveConversationMock).toHaveBeenCalledWith('user-1', 'thread-1');
    // prevSessionSummary 가 영속화된 Conversation.summary 로 채워졌는지.
    expect(buildMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ prevSessionSummary: '지난 대화 요약' }),
    );
    // conversationId 가 state 로 반환되어 persistTurnNode 가 쓸 수 있다.
    expect(out.conversationId).toBe('conv-1');
  });

  it('resolveConversation null(익명/미배선) → conversationId undefined + prevSessionSummary null', async () => {
    resolveConversationMock.mockResolvedValue(null);

    const out = await personalContext(state({}), undefined);

    expect(buildMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ prevSessionSummary: null }),
    );
    expect(out.conversationId).toBeUndefined();
  });

  it('buildConversationMemory 는 longTermSummary 도 함께 받는다(회귀 없음)', async () => {
    resolveConversationMock.mockResolvedValue(null);
    await personalContext(state({}), undefined);
    expect(buildMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ longTermSummary: 'long-term-x' }),
    );
  });
});
