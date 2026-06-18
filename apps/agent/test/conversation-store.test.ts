/**
 * ConversationStore 유닛 테스트 (P3-W9 9.3/9.4)
 *
 * getPrisma 를 모킹해 user/conversation/message/personalAgentState 의 호출을 spy 한다.
 * best-effort 계약(throw 금지) + FK 가드(User 존재 확인) + write-through 증분을 검증한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 모킹 핸들 — vi.hoisted 로 import 보다 먼저 정의(vi.mock 이 끌어올려짐).
const {
  userFindUnique,
  conversationUpsert,
  conversationUpdate,
  messageCreateMany,
  personalAgentUpsert,
  prismaHolder,
} = vi.hoisted(() => {
  const userFindUnique = vi.fn();
  const conversationUpsert = vi.fn();
  const conversationUpdate = vi.fn();
  const messageCreateMany = vi.fn();
  const personalAgentUpsert = vi.fn();
  // prismaHolder.value 가 null 이면 DB 비활성(getPrisma → undefined) 시뮬레이션.
  const prismaHolder: { value: unknown } = {
    value: {
      user: { findUnique: userFindUnique },
      conversation: { upsert: conversationUpsert, update: conversationUpdate },
      message: { createMany: messageCreateMany },
      personalAgentState: { upsert: personalAgentUpsert },
    },
  };
  return {
    userFindUnique,
    conversationUpsert,
    conversationUpdate,
    messageCreateMany,
    personalAgentUpsert,
    prismaHolder,
  };
});

vi.mock('../src/utils/prisma', () => ({
  getPrisma: () => prismaHolder.value ?? undefined,
  __resetPrismaForTest: () => {},
}));

// @prisma/client 의 Prisma.JsonNull 만 필요(conversation-store import).
vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: Symbol('JsonNull') },
}));

import {
  resolveConversation,
  persistTurn,
  bumpMessageCount,
  MESSAGE_COUNT_PER_TURN,
} from '../src/personal/conversation-store';

beforeEach(() => {
  vi.clearAllMocks();
  prismaHolder.value = {
    user: { findUnique: userFindUnique },
    conversation: { upsert: conversationUpsert, update: conversationUpdate },
    message: { createMany: messageCreateMany },
    personalAgentState: { upsert: personalAgentUpsert },
  };
});

describe('resolveConversation', () => {
  it('userId 없으면 null (DB 미조회)', async () => {
    const out = await resolveConversation(undefined, 'thread-1');
    expect(out).toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('threadId 없으면 null', async () => {
    const out = await resolveConversation('user-1', '');
    expect(out).toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('DB 비활성(getPrisma undefined)이면 null', async () => {
    prismaHolder.value = null;
    const out = await resolveConversation('user-1', 'thread-1');
    expect(out).toBeNull();
  });

  it('User 없으면(미등록/익명) null — FK 위반 방지(upsert 미호출)', async () => {
    userFindUnique.mockResolvedValue(null);
    const out = await resolveConversation('user-x', 'thread-1');
    expect(out).toBeNull();
    expect(conversationUpsert).not.toHaveBeenCalled();
  });

  it('정상 → {conversationId, sessionSummary} (thread_id 멱등 upsert)', async () => {
    userFindUnique.mockResolvedValue({ id: 'user-1' });
    conversationUpsert.mockResolvedValue({
      id: 'conv-1',
      summary: '이전 세션 요약입니다',
    });
    const out = await resolveConversation('user-1', 'thread-1');
    expect(out).toEqual({
      conversationId: 'conv-1',
      sessionSummary: '이전 세션 요약입니다',
    });
    // thread_id(unique) 로 upsert: 없으면 create({userId, threadId}).
    expect(conversationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { threadId: 'thread-1' },
        create: { userId: 'user-1', threadId: 'thread-1' },
      }),
    );
  });

  it('summary null 이면 sessionSummary null', async () => {
    userFindUnique.mockResolvedValue({ id: 'user-1' });
    conversationUpsert.mockResolvedValue({ id: 'conv-1', summary: null });
    const out = await resolveConversation('user-1', 'thread-1');
    expect(out).toEqual({ conversationId: 'conv-1', sessionSummary: null });
  });

  it('조회 throw 해도 null (best-effort, throw 안 함)', async () => {
    userFindUnique.mockRejectedValue(new Error('connection refused'));
    const out = await resolveConversation('user-1', 'thread-1');
    expect(out).toBeNull();
  });
});

describe('persistTurn', () => {
  it('Message 2건 createMany(user/assistant) + Conversation touch', async () => {
    messageCreateMany.mockResolvedValue({ count: 2 });
    conversationUpdate.mockResolvedValue({});
    await persistTurn({
      conversationId: 'conv-1',
      userText: '안녕',
      assistantText: '안녕! 야구 얘기하자',
      a2uiEnvelope: [{ createSurface: {} }],
    });
    expect(messageCreateMany).toHaveBeenCalledTimes(1);
    const arg = messageCreateMany.mock.calls[0][0] as {
      data: Array<{ role: string; content: string }>;
    };
    expect(arg.data).toHaveLength(2);
    expect(arg.data[0]).toMatchObject({ role: 'user', content: '안녕' });
    expect(arg.data[1]).toMatchObject({
      role: 'assistant',
      content: '안녕! 야구 얘기하자',
    });
    // idle 트리거용 updated_at touch.
    expect(conversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conv-1' } }),
    );
  });

  it('a2uiEnvelope undefined → Prisma.JsonNull 저장(throw 없음)', async () => {
    messageCreateMany.mockResolvedValue({ count: 2 });
    conversationUpdate.mockResolvedValue({});
    await persistTurn({
      conversationId: 'conv-1',
      userText: 'q',
      assistantText: '',
    });
    const arg = messageCreateMany.mock.calls[0][0] as {
      data: Array<{ a2uiEnvelope: unknown }>;
    };
    // assistant row(a2uiEnvelope) 는 JsonNull(Symbol) 로 들어간다.
    expect(typeof arg.data[1].a2uiEnvelope).toBe('symbol');
  });

  it('DB 비활성이면 skip(throw 없음)', async () => {
    prismaHolder.value = null;
    await expect(
      persistTurn({ conversationId: 'conv-1', userText: 'a', assistantText: 'b' }),
    ).resolves.toBeUndefined();
    expect(messageCreateMany).not.toHaveBeenCalled();
  });

  it('createMany throw 해도 throw 안 함(best-effort)', async () => {
    messageCreateMany.mockRejectedValue(new Error('db error'));
    await expect(
      persistTurn({ conversationId: 'conv-1', userText: 'a', assistantText: 'b' }),
    ).resolves.toBeUndefined();
  });
});

describe('bumpMessageCount', () => {
  it('messageCount +2 increment(write-through) + lastActive 갱신', async () => {
    personalAgentUpsert.mockResolvedValue({ messageCount: 8 });
    const out = await bumpMessageCount('user-1');
    expect(out).toBe(8);
    const arg = personalAgentUpsert.mock.calls[0][0] as {
      where: { userId: string };
      create: { messageCount: number };
      update: { messageCount: { increment: number } };
    };
    expect(arg.where).toEqual({ userId: 'user-1' });
    expect(arg.create.messageCount).toBe(MESSAGE_COUNT_PER_TURN);
    expect(arg.update.messageCount).toEqual({
      increment: MESSAGE_COUNT_PER_TURN,
    });
  });

  it('userId 빈문자열이면 null', async () => {
    const out = await bumpMessageCount('');
    expect(out).toBeNull();
    expect(personalAgentUpsert).not.toHaveBeenCalled();
  });

  it('DB 비활성이면 null', async () => {
    prismaHolder.value = null;
    const out = await bumpMessageCount('user-1');
    expect(out).toBeNull();
  });

  it('upsert throw(FK 위반 등) → null(best-effort)', async () => {
    personalAgentUpsert.mockRejectedValue(new Error('FK violation'));
    const out = await bumpMessageCount('user-1');
    expect(out).toBeNull();
  });
});
