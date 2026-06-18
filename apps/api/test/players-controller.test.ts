/**
 * players-controller.test.ts — PlayersController 유닛 테스트 (P4-W10 10.1).
 *
 * showPlayerDetail 의 숫자 검증·당해 시즌 include·ToolCallLog 기록을 prisma 모킹으로 검증.
 *  - playerId 비정수 → BadRequestException.
 *  - Player 없음 → NotFoundException.
 *  - 정상 → player + batting/pitching 반환 + toolCallLog 기록.
 *  - 스탯 없으면 batting/pitching null.
 *  - toolCallLog 실패는 무시.
 *  - 레벨 게이팅(ADR-053): Lv4 미만 → 403 locked, Lv4+ 정상.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PlayersController } from '../src/players/players.controller';
import type { RequestWithUser } from '../src/auth/jwt-auth.guard';

function reqFor(userId = 'u1'): RequestWithUser {
  return { user: { userId } } as RequestWithUser;
}

function makeController(opts: {
  player?: unknown;
  toolLogThrows?: boolean;
  userLevel?: number;
}) {
  const defaultPlayer = {
    id: 1,
    name: '홍길동',
    teamId: 'lotte',
    position: 'OF',
    battingStats: [{ avg: '0.300' }],
    pitchingStats: [],
  };
  const findUnique = vi
    .fn()
    .mockResolvedValue(opts.player === undefined ? defaultPlayer : opts.player);
  const toolCreate = opts.toolLogThrows
    ? vi.fn().mockRejectedValue(new Error('log down'))
    : vi.fn().mockResolvedValue({});
  // 상세 통계는 Lv4 해금 — 기본 Lv4 로 통과시키되 게이팅 테스트에서 override.
  const userFindUnique = vi
    .fn()
    .mockResolvedValue({ level: opts.userLevel ?? 4 });

  const prisma = {
    user: { findUnique: userFindUnique },
    player: { findUnique },
    toolCallLog: { create: toolCreate },
  };
  const controller = new PlayersController(prisma as never);
  return { controller, findUnique, toolCreate, userFindUnique };
}

describe('PlayersController.showPlayerDetail', () => {
  it('playerId 비정수 → BadRequestException', async () => {
    const { controller, findUnique } = makeController({});
    await expect(
      controller.showPlayerDetail(reqFor(), 'abc'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('Player 없음 → NotFoundException', async () => {
    const { controller } = makeController({ player: null });
    await expect(
      controller.showPlayerDetail(reqFor(), '99'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('정상 → player + batting/pitching 반환 + toolCallLog 기록', async () => {
    const { controller, findUnique, toolCreate } = makeController({});
    const result = await controller.showPlayerDetail(reqFor(), '1');

    // 당해 시즌 필터로 조회.
    const season = new Date().getFullYear();
    const findArg = findUnique.mock.calls[0][0] as {
      where: { id: number };
      include: {
        battingStats: { where: { season: number } };
        pitchingStats: { where: { season: number } };
      };
    };
    expect(findArg.where).toEqual({ id: 1 });
    expect(findArg.include.battingStats.where.season).toBe(season);

    expect(result.player).toEqual({
      id: 1,
      name: '홍길동',
      teamId: 'lotte',
      position: 'OF',
    });
    expect(result.batting).toEqual({ avg: '0.300' });
    expect(result.pitching).toBeNull();

    expect(toolCreate).toHaveBeenCalledTimes(1);
    const logArg = toolCreate.mock.calls[0][0] as {
      data: { actionName: string; params: { playerId: number } };
    };
    expect(logArg.data.actionName).toBe('showPlayerDetail');
    expect(logArg.data.params).toEqual({ playerId: 1 });
  });

  it('스탯 없으면 batting/pitching null', async () => {
    const { controller } = makeController({
      player: {
        id: 5,
        name: null,
        teamId: null,
        position: null,
        battingStats: [],
        pitchingStats: [],
      },
    });
    const result = await controller.showPlayerDetail(reqFor(), '5');
    expect(result.batting).toBeNull();
    expect(result.pitching).toBeNull();
  });

  it('toolCallLog 실패는 무시(조회 응답 정상)', async () => {
    const { controller } = makeController({ toolLogThrows: true });
    const result = await controller.showPlayerDetail(reqFor(), '1');
    expect(result.player.id).toBe(1);
  });

  it('Lv4 미만(Lv3) → 403 locked, player 조회 안 함', async () => {
    const { controller, findUnique } = makeController({ userLevel: 3 });
    await expect(
      controller.showPlayerDetail(reqFor(), '1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('Lv5 → 상세 통계 정상 통과', async () => {
    const { controller } = makeController({ userLevel: 5 });
    const result = await controller.showPlayerDetail(reqFor(), '1');
    expect(result.player.id).toBe(1);
  });
});
