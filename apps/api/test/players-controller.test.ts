/**
 * players-controller.test.ts — PlayersController 유닛 테스트 (P4-W10 10.1).
 *
 * showPlayerDetail 의 숫자 검증·당해 시즌 include·ToolCallLog 기록을 prisma 모킹으로 검증.
 *  - playerId 비정수 → BadRequestException.
 *  - Player 없음 → NotFoundException.
 *  - 정상 → player + batting/pitching 반환 + toolCallLog 기록.
 *  - 스탯 없으면 batting/pitching null.
 *  - toolCallLog 실패는 무시.
 */
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlayersController } from '../src/players/players.controller';

function makeController(opts: {
  player?: unknown;
  toolLogThrows?: boolean;
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

  const prisma = {
    player: { findUnique },
    toolCallLog: { create: toolCreate },
  };
  const controller = new PlayersController(prisma as never);
  return { controller, findUnique, toolCreate };
}

describe('PlayersController.showPlayerDetail', () => {
  it('playerId 비정수 → BadRequestException', async () => {
    const { controller, findUnique } = makeController({});
    await expect(controller.showPlayerDetail('abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('Player 없음 → NotFoundException', async () => {
    const { controller } = makeController({ player: null });
    await expect(controller.showPlayerDetail('99')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('정상 → player + batting/pitching 반환 + toolCallLog 기록', async () => {
    const { controller, findUnique, toolCreate } = makeController({});
    const result = await controller.showPlayerDetail('1');

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
    const result = await controller.showPlayerDetail('5');
    expect(result.batting).toBeNull();
    expect(result.pitching).toBeNull();
  });

  it('toolCallLog 실패는 무시(조회 응답 정상)', async () => {
    const { controller } = makeController({ toolLogThrows: true });
    const result = await controller.showPlayerDetail('1');
    expect(result.player.id).toBe(1);
  });
});
