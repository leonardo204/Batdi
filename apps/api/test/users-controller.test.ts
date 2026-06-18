/**
 * users-controller.test.ts — UsersController + level-rules 유닛 테스트 (P4-W10 10.4).
 *
 * - buildLevelInfo 레벨 경계/진척률(xp 500→Lv2, MAX 등).
 * - myLevel: xpPoints 로 레벨 정보 계산(prisma 모킹).
 * - myStats: 대화/메시지/턴/관심선수 집계(prisma 모킹).
 */
import { describe, it, expect, vi } from 'vitest';
import { UsersController } from '../src/users/users.controller';
import { buildLevelInfo, computeLevel } from '../src/users/level-rules';
import type { RequestWithUser } from '../src/auth/jwt-auth.guard';

function reqFor(userId: string): RequestWithUser {
  return { user: { userId } } as RequestWithUser;
}

describe('level-rules.buildLevelInfo', () => {
  it('xp 0 → Lv1 신입 팬, progress 0%, next=500', () => {
    const info = buildLevelInfo(0);
    expect(info.level).toBe(1);
    expect(info.levelName).toBe('신입 팬');
    expect(info.currentMinXp).toBe(0);
    expect(info.nextLevelXp).toBe(500);
    expect(info.progressPercent).toBe(0);
    expect(info.allLevels).toHaveLength(5);
  });

  it('xp 500 → Lv2 내야석, 구간 시작이므로 progress 0%', () => {
    const info = buildLevelInfo(500);
    expect(info.level).toBe(2);
    expect(info.levelName).toBe('내야석');
    expect(info.currentMinXp).toBe(500);
    expect(info.nextLevelXp).toBe(2000);
    expect(info.progressPercent).toBe(0);
  });

  it('xp 1250 → Lv2, 구간(500~2000) 중간 50%', () => {
    const info = buildLevelInfo(1250);
    expect(info.level).toBe(2);
    // gained 750 / span 1500 = 50%
    expect(info.progressPercent).toBe(50);
  });

  it('xp 499 → Lv1, 구간(0~500) 99% 미만(floor)', () => {
    const info = buildLevelInfo(499);
    expect(info.level).toBe(1);
    expect(info.progressPercent).toBe(99);
  });

  it('xp 10000 → Lv5 12번째 선수, MAX(next=null, 100%)', () => {
    const info = buildLevelInfo(10000);
    expect(info.level).toBe(5);
    expect(info.levelName).toBe('12번째 선수');
    expect(info.nextLevelXp).toBeNull();
    expect(info.progressPercent).toBe(100);
  });

  it('음수/NaN xp → Lv1 폴백', () => {
    expect(buildLevelInfo(-100).level).toBe(1);
    expect(buildLevelInfo(Number.NaN).level).toBe(1);
    expect(computeLevel(-5)).toBe(1);
  });
});

describe('UsersController.myLevel', () => {
  it('user.xpPoints 로 레벨 정보 반환', async () => {
    const findUnique = vi.fn().mockResolvedValue({ xpPoints: 2000 });
    const prisma = { user: { findUnique } };
    const controller = new UsersController(prisma as never);

    const info = await controller.myLevel(reqFor('u1'));
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { xpPoints: true },
    });
    expect(info.level).toBe(3);
    expect(info.levelName).toBe('응원단석');
  });

  it('user 없음 → xp 0 → Lv1', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { user: { findUnique } };
    const controller = new UsersController(prisma as never);

    const info = await controller.myLevel(reqFor('ghost'));
    expect(info.level).toBe(1);
    expect(info.xp).toBe(0);
  });
});

describe('UsersController.myStats', () => {
  it('대화/메시지/턴/관심선수/레벨 집계', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ level: 2, xpPoints: 700 }) },
      personalAgentState: {
        findUnique: vi.fn().mockResolvedValue({ messageCount: 141 }),
      },
      conversation: { count: vi.fn().mockResolvedValue(12) },
      userFavorite: { count: vi.fn().mockResolvedValue(3) },
    };
    const controller = new UsersController(prisma as never);

    const stats = await controller.myStats(reqFor('u1'));
    expect(stats).toEqual({
      conversationCount: 12,
      messageCount: 141,
      turns: 70, // floor(141/2)
      favoriteCount: 3,
      level: 2,
      xp: 700,
    });
    expect(prisma.conversation.count).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
    expect(prisma.userFavorite.count).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });

  it('personalAgentState 없음 → messageCount/turns 0', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ level: 1, xpPoints: 0 }) },
      personalAgentState: { findUnique: vi.fn().mockResolvedValue(null) },
      conversation: { count: vi.fn().mockResolvedValue(0) },
      userFavorite: { count: vi.fn().mockResolvedValue(0) },
    };
    const controller = new UsersController(prisma as never);

    const stats = await controller.myStats(reqFor('new'));
    expect(stats.messageCount).toBe(0);
    expect(stats.turns).toBe(0);
    expect(stats.level).toBe(1);
  });
});
