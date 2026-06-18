/**
 * favorites-controller.test.ts — FavoritesController 유닛 테스트 (P4-W10 10.1/10.2 키스톤).
 *
 * registerFavoritePlayer 의 검증·upsert·ToolCallLog 기록을 prisma 모킹으로 검증한다.
 *  - playerId 비정수 → BadRequestException.
 *  - Player 없음 → NotFoundException.
 *  - 정상 → upsert(소유자=req.user) + count 반환 + toolCallLog.create 기록.
 *  - toolCallLog.create 실패는 무시(등록 응답 정상).
 */
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FavoritesController } from '../src/favorites/favorites.controller';
import type { RequestWithUser } from '../src/auth/jwt-auth.guard';

function makeController(opts: {
  player?: { id: number } | null;
  favoritesCount?: number;
  toolLogThrows?: boolean;
}) {
  const findUnique = vi
    .fn()
    .mockResolvedValue(opts.player === undefined ? { id: 1 } : opts.player);
  const upsert = vi.fn().mockResolvedValue({});
  const count = vi.fn().mockResolvedValue(opts.favoritesCount ?? 1);
  const toolCreate = opts.toolLogThrows
    ? vi.fn().mockRejectedValue(new Error('log down'))
    : vi.fn().mockResolvedValue({});

  const prisma = {
    player: { findUnique },
    userFavorite: { upsert, count },
    toolCallLog: { create: toolCreate },
  };
  const controller = new FavoritesController(prisma as never);
  return { controller, findUnique, upsert, count, toolCreate };
}

function reqFor(userId: string): RequestWithUser {
  return { user: { userId } } as RequestWithUser;
}

describe('FavoritesController.registerFavoritePlayer', () => {
  it('playerId 비정수 → BadRequestException', async () => {
    const { controller, findUnique } = makeController({});
    await expect(
      controller.registerFavoritePlayer(reqFor('u1'), { playerId: 'abc' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('playerId 누락 → BadRequestException', async () => {
    const { controller } = makeController({});
    await expect(
      controller.registerFavoritePlayer(reqFor('u1'), {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Player 없음 → NotFoundException', async () => {
    const { controller, upsert } = makeController({ player: null });
    await expect(
      controller.registerFavoritePlayer(reqFor('u1'), { playerId: 99 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('정상 → 소유자 기준 upsert + count 반환 + toolCallLog 기록', async () => {
    const { controller, upsert, count, toolCreate } = makeController({
      favoritesCount: 3,
    });
    const result = await controller.registerFavoritePlayer(reqFor('u1'), {
      playerId: 42,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { userId_playerId: { userId: 'u1', playerId: 42 } },
      create: { userId: 'u1', playerId: 42, source: 'explicit' },
      update: {},
    });
    expect(count).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(result).toEqual({ success: true, favoritesCount: 3 });

    // ToolCallLog 기록(actionName/params/result).
    expect(toolCreate).toHaveBeenCalledTimes(1);
    const logArg = toolCreate.mock.calls[0][0] as {
      data: {
        actionName: string;
        params: { playerId: number };
        result: { success: boolean; favoritesCount: number };
        durationMs: number;
      };
    };
    expect(logArg.data.actionName).toBe('registerFavoritePlayer');
    expect(logArg.data.params).toEqual({ playerId: 42 });
    expect(logArg.data.result).toEqual({ success: true, favoritesCount: 3 });
    expect(typeof logArg.data.durationMs).toBe('number');
  });

  it('문자 숫자(playerId="42")도 정수로 수용', async () => {
    const { controller, upsert } = makeController({ favoritesCount: 1 });
    const result = await controller.registerFavoritePlayer(reqFor('u1'), {
      playerId: '42' as unknown as number,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: 'u1', playerId: 42, source: 'explicit' },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('toolCallLog 기록 실패는 무시(등록 응답 정상)', async () => {
    const { controller } = makeController({
      favoritesCount: 2,
      toolLogThrows: true,
    });
    const result = await controller.registerFavoritePlayer(reqFor('u1'), {
      playerId: 5,
    });
    expect(result).toEqual({ success: true, favoritesCount: 2 });
  });
});
