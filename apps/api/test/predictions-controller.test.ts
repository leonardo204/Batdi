/**
 * predictions-controller.test.ts — PredictionsController 유닛 테스트 (ADR-054, Lv2 해금).
 *
 * POST /predictions:
 *  - Lv2 미만 → ForbiddenException(403 locked).
 *  - 종료(FINISHED) 경기 → BadRequestException.
 *  - predictedWinner 화이트리스트 외 → BadRequestException.
 *  - 경기 없음 → NotFoundException.
 *  - 정상 → 소유자 기준 upsert(예측 변경 허용) + {saved:true}.
 * GET /predictions/me 적중률 on-read 계산:
 *  - home 승 예측 + home 승 결과 → correct.
 *  - 예측 불일치 → !correct.
 *  - 무승부(스코어 동점) → finished 카운트 제외.
 *  - finished 0 → accuracy null.
 *
 * prisma 모킹으로 검증한다.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PredictionsController } from '../src/predictions/predictions.controller';
import type { RequestWithUser } from '../src/auth/jwt-auth.guard';

type GameRow = {
  gameKey: string;
  gameStatus: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
};

function reqFor(userId: string): RequestWithUser {
  return { user: { userId } } as RequestWithUser;
}

function makePostController(opts: {
  level?: number;
  game?: { gameStatus: string } | null;
}) {
  const userFindUnique = vi
    .fn()
    .mockResolvedValue({ level: opts.level ?? 2 });
  const kboFindUnique = vi
    .fn()
    .mockResolvedValue(opts.game === undefined ? { gameStatus: 'SCHEDULED' } : opts.game);
  const upsert = vi.fn().mockResolvedValue({});

  const prisma = {
    user: { findUnique: userFindUnique },
    kboGame: { findUnique: kboFindUnique, findMany: vi.fn() },
    matchPrediction: { upsert, findMany: vi.fn() },
  };
  const controller = new PredictionsController(prisma as never);
  return { controller, upsert, kboFindUnique };
}

function makeGetController(opts: {
  predictions: { gameKey: string; predictedWinner: string }[];
  games: GameRow[];
}) {
  const predFindMany = vi.fn().mockResolvedValue(opts.predictions);
  const kboFindMany = vi.fn().mockResolvedValue(opts.games);

  const prisma = {
    user: { findUnique: vi.fn() },
    kboGame: { findUnique: vi.fn(), findMany: kboFindMany },
    matchPrediction: { upsert: vi.fn(), findMany: predFindMany },
  };
  const controller = new PredictionsController(prisma as never);
  return { controller, kboFindMany };
}

describe('PredictionsController.createPrediction', () => {
  it('Lv2 미만 → ForbiddenException(403 locked)', async () => {
    const { controller, upsert } = makePostController({ level: 1 });
    await expect(
      controller.createPrediction(reqFor('u1'), {
        gameKey: '20260618-doosan-lotte-0',
        predictedWinner: 'home',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('predictedWinner 화이트리스트 외 → BadRequestException', async () => {
    const { controller } = makePostController({ level: 2 });
    await expect(
      controller.createPrediction(reqFor('u1'), {
        gameKey: '20260618-doosan-lotte-0',
        predictedWinner: 'draw',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('gameKey 누락 → BadRequestException', async () => {
    const { controller } = makePostController({ level: 2 });
    await expect(
      controller.createPrediction(reqFor('u1'), { predictedWinner: 'home' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('경기 없음 → NotFoundException', async () => {
    const { controller, upsert } = makePostController({
      level: 2,
      game: null,
    });
    await expect(
      controller.createPrediction(reqFor('u1'), {
        gameKey: '20260618-doosan-lotte-0',
        predictedWinner: 'home',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('종료(FINISHED) 경기 → BadRequestException', async () => {
    const { controller, upsert } = makePostController({
      level: 2,
      game: { gameStatus: 'FINISHED' },
    });
    await expect(
      controller.createPrediction(reqFor('u1'), {
        gameKey: '20260618-doosan-lotte-0',
        predictedWinner: 'away',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('정상(미종료) → 소유자 기준 upsert(예측 변경 허용) + saved', async () => {
    const { controller, upsert } = makePostController({
      level: 2,
      game: { gameStatus: 'SCHEDULED' },
    });
    const result = await controller.createPrediction(reqFor('u1'), {
      gameKey: '20260618-doosan-lotte-0',
      predictedWinner: 'home',
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        userId_gameKey: { userId: 'u1', gameKey: '20260618-doosan-lotte-0' },
      },
      create: {
        userId: 'u1',
        gameKey: '20260618-doosan-lotte-0',
        predictedWinner: 'home',
      },
      update: { predictedWinner: 'home' },
    });
    expect(result).toEqual({
      gameKey: '20260618-doosan-lotte-0',
      predictedWinner: 'home',
      saved: true,
    });
  });
});

describe('PredictionsController.myPredictions (적중률 on-read)', () => {
  it('home 승 예측 + home 승 결과 → correct, accuracy 1', async () => {
    const { controller } = makeGetController({
      predictions: [{ gameKey: 'g1', predictedWinner: 'home' }],
      games: [
        {
          gameKey: 'g1',
          gameStatus: 'FINISHED',
          homeTeam: 'lotte',
          awayTeam: 'doosan',
          homeScore: 5,
          awayScore: 3,
        },
      ],
    });
    const result = await controller.myPredictions(reqFor('u1'));
    expect(result.predictions[0].actualWinner).toBe('home');
    expect(result.predictions[0].correct).toBe(true);
    expect(result.predictions[0].matchup).toBe('doosan vs lotte');
    expect(result.stats).toEqual({
      total: 1,
      finished: 1,
      correct: 1,
      accuracy: 1,
    });
  });

  it('예측 불일치(home 예측, away 승) → !correct, accuracy 0', async () => {
    const { controller } = makeGetController({
      predictions: [{ gameKey: 'g1', predictedWinner: 'home' }],
      games: [
        {
          gameKey: 'g1',
          gameStatus: 'FINISHED',
          homeTeam: 'lotte',
          awayTeam: 'doosan',
          homeScore: 2,
          awayScore: 7,
        },
      ],
    });
    const result = await controller.myPredictions(reqFor('u1'));
    expect(result.predictions[0].actualWinner).toBe('away');
    expect(result.predictions[0].correct).toBe(false);
    expect(result.stats).toEqual({
      total: 1,
      finished: 1,
      correct: 0,
      accuracy: 0,
    });
  });

  it('무승부(동점) → finished 제외, accuracy null', async () => {
    const { controller } = makeGetController({
      predictions: [{ gameKey: 'g1', predictedWinner: 'home' }],
      games: [
        {
          gameKey: 'g1',
          gameStatus: 'FINISHED',
          homeTeam: 'lotte',
          awayTeam: 'doosan',
          homeScore: 4,
          awayScore: 4,
        },
      ],
    });
    const result = await controller.myPredictions(reqFor('u1'));
    expect(result.predictions[0].actualWinner).toBeUndefined();
    expect(result.predictions[0].correct).toBeUndefined();
    expect(result.stats).toEqual({
      total: 1,
      finished: 0,
      correct: 0,
      accuracy: null,
    });
  });

  it('미종료 경기뿐 → finished 0, accuracy null', async () => {
    const { controller } = makeGetController({
      predictions: [{ gameKey: 'g1', predictedWinner: 'away' }],
      games: [
        {
          gameKey: 'g1',
          gameStatus: 'SCHEDULED',
          homeTeam: 'lotte',
          awayTeam: 'doosan',
          homeScore: null,
          awayScore: null,
        },
      ],
    });
    const result = await controller.myPredictions(reqFor('u1'));
    expect(result.predictions[0].status).toBe('SCHEDULED');
    expect(result.predictions[0].correct).toBeUndefined();
    expect(result.stats).toEqual({
      total: 1,
      finished: 0,
      correct: 0,
      accuracy: null,
    });
  });

  it('예측 없음 → 빈 목록 + accuracy null', async () => {
    const { controller, kboFindMany } = makeGetController({
      predictions: [],
      games: [],
    });
    const result = await controller.myPredictions(reqFor('u1'));
    expect(result.predictions).toEqual([]);
    expect(result.stats).toEqual({
      total: 0,
      finished: 0,
      correct: 0,
      accuracy: null,
    });
    // 예측 0건이면 kbo_games 조회를 생략한다.
    expect(kboFindMany).not.toHaveBeenCalled();
  });

  it('혼합(적중 1·미적중 1·무승부 1·미종료 1) → accuracy 0.5', async () => {
    const { controller } = makeGetController({
      predictions: [
        { gameKey: 'g1', predictedWinner: 'home' }, // 적중
        { gameKey: 'g2', predictedWinner: 'home' }, // 미적중
        { gameKey: 'g3', predictedWinner: 'away' }, // 무승부 → 제외
        { gameKey: 'g4', predictedWinner: 'away' }, // 미종료 → 제외
      ],
      games: [
        { gameKey: 'g1', gameStatus: 'FINISHED', homeTeam: 'a', awayTeam: 'b', homeScore: 3, awayScore: 1 },
        { gameKey: 'g2', gameStatus: 'FINISHED', homeTeam: 'a', awayTeam: 'b', homeScore: 1, awayScore: 3 },
        { gameKey: 'g3', gameStatus: 'FINISHED', homeTeam: 'a', awayTeam: 'b', homeScore: 2, awayScore: 2 },
        { gameKey: 'g4', gameStatus: 'PLAYING', homeTeam: 'a', awayTeam: 'b', homeScore: null, awayScore: null },
      ],
    });
    const result = await controller.myPredictions(reqFor('u1'));
    expect(result.stats).toEqual({
      total: 4,
      finished: 2,
      correct: 1,
      accuracy: 0.5,
    });
  });
});
