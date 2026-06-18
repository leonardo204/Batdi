/**
 * stats-controller.test.ts — StatsController 유닛 테스트 (P4-W10 10.1).
 *
 * showTeamComparison 의 화이트리스트 검증·당해 시즌 조회·ToolCallLog 기록을 prisma 모킹으로 검증.
 *  - teamA/teamB 화이트리스트 외 → BadRequestException.
 *  - 정상 → 2팀 기록 투영 반환 + toolCallLog 기록.
 *  - 기록 없는 팀 → null.
 *  - toolCallLog 실패는 무시.
 */
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { StatsController } from '../src/stats/stats.controller';

function rec(team: string, rank: number) {
  return {
    team,
    teamRank: rank,
    wins: 50,
    losses: 40,
    draws: 2,
    winRate: 0.555,
    gamesBehind: rank === 1 ? 0 : 3.5,
  };
}

function makeController(opts: {
  records?: unknown[];
  toolLogThrows?: boolean;
}) {
  const findMany = vi
    .fn()
    .mockResolvedValue(
      opts.records === undefined
        ? [rec('lotte', 1), rec('doosan', 4)]
        : opts.records,
    );
  const toolCreate = opts.toolLogThrows
    ? vi.fn().mockRejectedValue(new Error('log down'))
    : vi.fn().mockResolvedValue({});

  const prisma = {
    teamSeasonRecord: { findMany },
    toolCallLog: { create: toolCreate },
  };
  const controller = new StatsController(prisma as never);
  return { controller, findMany, toolCreate };
}

describe('StatsController.showTeamComparison', () => {
  it('teamA 화이트리스트 외 → BadRequestException', async () => {
    const { controller, findMany } = makeController({});
    await expect(
      controller.showTeamComparison('hacked', 'doosan'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('teamB 누락 → BadRequestException', async () => {
    const { controller } = makeController({});
    await expect(
      controller.showTeamComparison('lotte', ''),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('정상 → 2팀 기록 투영 반환 + toolCallLog', async () => {
    const { controller, findMany, toolCreate } = makeController({});
    const result = await controller.showTeamComparison('lotte', 'doosan');

    const season = new Date().getFullYear();
    const findArg = findMany.mock.calls[0][0] as {
      where: { season: number; team: { in: string[] } };
    };
    expect(findArg.where.season).toBe(season);
    expect(findArg.where.team.in).toEqual(['lotte', 'doosan']);

    expect(result.teamA).toEqual({
      team: 'lotte',
      rank: 1,
      wins: 50,
      losses: 40,
      draws: 2,
      winRate: 0.555,
      gamesBehind: 0,
    });
    expect(result.teamB?.team).toBe('doosan');
    expect(result.teamB?.rank).toBe(4);

    expect(toolCreate).toHaveBeenCalledTimes(1);
    const logArg = toolCreate.mock.calls[0][0] as {
      data: { actionName: string; params: { teamA: string; teamB: string } };
    };
    expect(logArg.data.actionName).toBe('showTeamComparison');
    expect(logArg.data.params).toEqual({ teamA: 'lotte', teamB: 'doosan' });
  });

  it('기록 없는 팀 → null', async () => {
    const { controller } = makeController({ records: [rec('lotte', 1)] });
    const result = await controller.showTeamComparison('lotte', 'doosan');
    expect(result.teamA?.team).toBe('lotte');
    expect(result.teamB).toBeNull();
  });

  it('toolCallLog 실패는 무시', async () => {
    const { controller } = makeController({ toolLogThrows: true });
    const result = await controller.showTeamComparison('kia', 'hanwha');
    expect(result).toBeDefined();
  });
});
