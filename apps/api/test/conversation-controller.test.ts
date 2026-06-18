/**
 * conversation-controller.test.ts — ConversationController 유닛 테스트 (P3-W9 9.3).
 *
 * 명시적 종료 엔드포인트의 소유자 검증을 prisma·summary 모킹으로 검증한다.
 *  - 대화 없음 → NotFoundException.
 *  - 타 유저 소유 → ForbiddenException.
 *  - 본인 소유 → summarizeConversation 호출 + { summary } 반환.
 */
import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConversationController } from '../src/conversation/conversation.controller';
import type { RequestWithUser } from '../src/auth/jwt-auth.guard';

function makeController(conversation: { userId: string } | null) {
  const findUnique = vi.fn().mockResolvedValue(conversation);
  const findMany = vi.fn().mockResolvedValue([]);
  const deleteFn = vi.fn().mockResolvedValue({ id: 'conv-1' });
  const prisma = {
    conversation: { findUnique, findMany, delete: deleteFn },
  };
  const summarizeConversation = vi.fn().mockResolvedValue('요약 결과');
  const summary = { summarizeConversation };
  const controller = new ConversationController(
    prisma as never,
    summary as never,
  );
  return { controller, findUnique, findMany, deleteFn, summarizeConversation };
}

function reqFor(userId: string): RequestWithUser {
  return { user: { userId } } as RequestWithUser;
}

describe('ConversationController.endSession', () => {
  it('대화 없음 → NotFoundException', async () => {
    const { controller, summarizeConversation } = makeController(null);
    await expect(
      controller.endSession(reqFor('u1'), 'conv-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(summarizeConversation).not.toHaveBeenCalled();
  });

  it('타 유저 소유 → ForbiddenException', async () => {
    const { controller, summarizeConversation } = makeController({
      userId: 'owner',
    });
    await expect(
      controller.endSession(reqFor('intruder'), 'conv-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(summarizeConversation).not.toHaveBeenCalled();
  });

  it('본인 소유 → summarizeConversation 호출 + { summary } 반환', async () => {
    const { controller, summarizeConversation } = makeController({
      userId: 'u1',
    });
    const result = await controller.endSession(reqFor('u1'), 'conv-1');
    expect(summarizeConversation).toHaveBeenCalledWith('conv-1');
    expect(result).toEqual({ summary: '요약 결과' });
  });
});

describe('ConversationController.list', () => {
  it('소유자(req.user.userId) 범위 + updatedAt desc + take 50 으로 조회', async () => {
    const { controller, findMany } = makeController(null);
    findMany.mockResolvedValue([]);

    await controller.list(reqFor('u1'));

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        summary: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
  });

  it('_count.messages → messageCount 로 매핑', async () => {
    const { controller, findMany } = makeController(null);
    const updatedAt = new Date('2026-06-18T00:00:00Z');
    findMany.mockResolvedValue([
      {
        id: 'c1',
        title: '두산 얘기',
        summary: '요약',
        updatedAt,
        _count: { messages: 7 },
      },
      {
        id: 'c2',
        title: null,
        summary: null,
        updatedAt,
        _count: { messages: 0 },
      },
    ]);

    const result = await controller.list(reqFor('u1'));
    expect(result).toEqual([
      { id: 'c1', title: '두산 얘기', summary: '요약', updatedAt, messageCount: 7 },
      { id: 'c2', title: null, summary: null, updatedAt, messageCount: 0 },
    ]);
  });

  it('q 없으면 소유자 범위만 필터(OR 절 없음)', async () => {
    const { controller, findMany } = makeController(null);
    await controller.list(reqFor('u1'));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  it('q 있으면 소유자 범위 + 제목/요약/메시지 content 부분일치(ILIKE) OR 필터', async () => {
    const { controller, findMany } = makeController(null);
    await controller.list(reqFor('u1'), '한화');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          OR: [
            { title: { contains: '한화', mode: 'insensitive' } },
            { summary: { contains: '한화', mode: 'insensitive' } },
            {
              messages: {
                some: { content: { contains: '한화', mode: 'insensitive' } },
              },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    );
  });

  it('q 공백만이면 검색 없이 전체 목록(소유자 범위)', async () => {
    const { controller, findMany } = makeController(null);
    await controller.list(reqFor('u1'), '   ');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });
});

describe('ConversationController.remove', () => {
  it('대화 없음 → NotFoundException', async () => {
    const { controller, deleteFn } = makeController(null);
    await expect(
      controller.remove(reqFor('u1'), 'conv-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('타 유저 소유 → ForbiddenException', async () => {
    const { controller, deleteFn } = makeController({ userId: 'owner' });
    await expect(
      controller.remove(reqFor('intruder'), 'conv-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('본인 소유 → delete 호출 + { deleted: true } 반환', async () => {
    const { controller, deleteFn } = makeController({ userId: 'u1' });
    const result = await controller.remove(reqFor('u1'), 'conv-1');
    expect(deleteFn).toHaveBeenCalledWith({ where: { id: 'conv-1' } });
    expect(result).toEqual({ deleted: true });
  });
});
