/**
 * scores-controller.test.ts — ScoresController 유닛 테스트 (P4-W10 10.1).
 *
 * requestScoreRefresh 의 경기 검증·L0 캐시 무효화·ToolCallLog 기록을 prisma 모킹으로 검증.
 *  - gameId 누락/빈값 → NotFoundException.
 *  - 경기 없음 → NotFoundException.
 *  - 정상 → cache_ui_envelopes deleteMany(두 팀 score) + {refreshed:true} + toolCallLog.
 *  - 캐시 무효화 실패는 무시(갱신 응답 정상).
 *  - toolCallLog 실패는 무시.
 */
import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ScoresController } from '../src/scores/scores.controller';

function makeController(opts: {
  game?: { homeTeam: string; awayTeam: string } | null;
  deleteThrows?: boolean;
  toolLogThrows?: boolean;
}) {
  const findUnique = vi
    .fn()
    .mockResolvedValue(
      opts.game === undefined
        ? { homeTeam: 'lotte', awayTeam: 'doosan' }
        : opts.game,
    );
  const deleteMany = opts.deleteThrows
    ? vi.fn().mockRejectedValue(new Error('cache down'))
    : vi.fn().mockResolvedValue({ count: 2 });
  const toolCreate = opts.toolLogThrows
    ? vi.fn().mockRejectedValue(new Error('log down'))
    : vi.fn().mockResolvedValue({});

  const prisma = {
    kboGame: { findUnique },
    cacheUiEnvelope: { deleteMany },
    toolCallLog: { create: toolCreate },
  };
  const controller = new ScoresController(prisma as never);
  return { controller, findUnique, deleteMany, toolCreate };
}

describe('ScoresController.requestScoreRefresh', () => {
  it('gameId 누락 → NotFoundException', async () => {
    const { controller, findUnique } = makeController({});
    await expect(
      controller.requestScoreRefresh({}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('gameId 빈문자 → NotFoundException', async () => {
    const { controller } = makeController({});
    await expect(
      controller.requestScoreRefresh({ gameId: '   ' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('경기 없음 → NotFoundException', async () => {
    const { controller, deleteMany } = makeController({ game: null });
    await expect(
      controller.requestScoreRefresh({ gameId: 'g-x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('정상 → 두 팀 score envelope 삭제 + {refreshed:true} + toolCallLog', async () => {
    const { controller, deleteMany, toolCreate } = makeController({});
    const result = await controller.requestScoreRefresh({
      gameId: '20260618-DOOSAN-LOTTE-0',
    });
    expect(result).toEqual({
      gameId: '20260618-DOOSAN-LOTTE-0',
      refreshed: true,
    });

    const delArg = deleteMany.mock.calls[0][0] as {
      where: { intent: string; teamId: { in: string[] } };
    };
    expect(delArg.where.intent).toBe('score');
    expect(delArg.where.teamId.in).toEqual(['lotte', 'doosan']);

    expect(toolCreate).toHaveBeenCalledTimes(1);
    const logArg = toolCreate.mock.calls[0][0] as {
      data: { actionName: string };
    };
    expect(logArg.data.actionName).toBe('requestScoreRefresh');
  });

  it('캐시 무효화 실패는 무시(갱신 응답 정상)', async () => {
    const { controller } = makeController({ deleteThrows: true });
    const result = await controller.requestScoreRefresh({ gameId: 'g-1' });
    expect(result.refreshed).toBe(true);
  });

  it('toolCallLog 실패는 무시', async () => {
    const { controller } = makeController({ toolLogThrows: true });
    const result = await controller.requestScoreRefresh({ gameId: 'g-1' });
    expect(result.refreshed).toBe(true);
  });
});
