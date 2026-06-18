/**
 * PredictionsController — 경기 승부 예측 + 적중률 (ADR-054, Lv2 해금).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-054.
 *
 * platform-ops §13 Lv2 해금 "경기 예측"을 실 기능으로 구현한다. 레이블만이던 항목을
 *   실제 예측 저장 + 적중률 산정으로 신설.
 *
 * - POST /predictions (JwtAuthGuard, requireLevel 2)
 *     {gameKey, predictedWinner} → kbo_games 존재+미종료 검증, 화이트리스트('home'|'away'),
 *     match_predictions upsert(예측 변경 허용·멱등). 반환 {gameKey, predictedWinner, saved}.
 * - GET /predictions/me (JwtAuthGuard)
 *     내 예측 전부 + kbo_games join. FINISHED 경기는 home/away 스코어로 실제 승자를 도출해
 *     적중 여부(on-read 계산·저장 안 함)를 산정한다. accuracy=correct/finished(finished 0 → null).
 *
 * ⚠️ 레벨 게이팅은 POST(쓰기)에만 건다. GET 은 본인 예측 현황 조회라 레벨 무관.
 *    소유자는 항상 req.user.userId 기준(JWT).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, type RequestWithUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { requireLevel } from '../users/level-guard';

/** 예측 가능한 승자 화이트리스트 — 'home' | 'away'. */
const VALID_WINNERS = ['home', 'away'] as const;
type Winner = (typeof VALID_WINNERS)[number];

/** 경기 예측 해금 레벨 — Lv2(내야석). */
const PREDICTION_MIN_LEVEL = 2;

/** POST /predictions 요청 바디. */
export interface CreatePredictionBody {
  gameKey?: unknown;
  predictedWinner?: unknown;
}

/** POST /predictions 성공 응답. */
export interface CreatePredictionResult {
  gameKey: string;
  predictedWinner: Winner;
  saved: true;
}

/** GET /predictions/me 의 예측 1건 항목. */
export interface PredictionItem {
  gameKey: string;
  predictedWinner: Winner;
  /** kbo_games.gameStatus(SCHEDULED|PLAYING|FINISHED|CANCELLED). 경기 없음이면 'UNKNOWN'. */
  status: string;
  /** FINISHED + 무승부 아님일 때만 실제 승자('home'|'away'). 그 외 undefined. */
  actualWinner?: Winner;
  /** actualWinner 가 있을 때만 적중 여부. 그 외 undefined. */
  correct?: boolean;
  /** 표시용 대진 — "away vs home"(팀 코드). */
  matchup: string;
}

/** GET /predictions/me 의 적중률 집계. */
export interface PredictionStats {
  /** 전체 예측 수. */
  total: number;
  /** 적중 판정 가능한(FINISHED + 무승부 아님) 예측 수. */
  finished: number;
  /** 적중 수. */
  correct: number;
  /** correct/finished(0~1). finished 0 이면 null. */
  accuracy: number | null;
}

/** GET /predictions/me 응답. */
export interface MyPredictionsResult {
  predictions: PredictionItem[];
  stats: PredictionStats;
}

@Controller('predictions')
export class PredictionsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 경기 승부 예측 저장(Lv2 해금) — 미종료 경기에 대해 home|away 예측을 upsert.
   *
   *   1) 레벨 게이팅: user.level 조회 → requireLevel(level, 2). 미달 403 { locked }.
   *   2) predictedWinner 화이트리스트('home'|'away') 검증 → BadRequest.
   *   3) kbo_games(gameKey) 존재 검증(없음 404) + 미종료 검증(FINISHED 면 BadRequest).
   *   4) match_predictions upsert(소유자 기준·예측 변경 허용). 반환 {gameKey, predictedWinner, saved}.
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  async createPrediction(
    @Req() req: RequestWithUser,
    @Body() body: CreatePredictionBody,
  ): Promise<CreatePredictionResult> {
    const userId = req.user.userId;

    // 1) 레벨 게이팅 — 경기 예측은 Lv2 해금.
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { level: true },
    });
    requireLevel(me?.level ?? 1, PREDICTION_MIN_LEVEL);

    // 2) predictedWinner 화이트리스트 검증.
    const predictedWinner = body?.predictedWinner;
    if (
      typeof predictedWinner !== 'string' ||
      !VALID_WINNERS.includes(predictedWinner as Winner)
    ) {
      throw new BadRequestException(
        `predictedWinner 는 ${VALID_WINNERS.join('|')} 중 하나여야 합니다.`,
      );
    }

    // gameKey 기본 검증(빈 문자열/비문자 차단).
    const gameKey = body?.gameKey;
    if (typeof gameKey !== 'string' || gameKey.trim() === '') {
      throw new BadRequestException('gameKey 는 비어 있을 수 없습니다.');
    }

    // 3) kbo_games 존재 + 미종료 검증.
    const game = await this.prisma.kboGame.findUnique({
      where: { gameKey },
      select: { gameStatus: true },
    });
    if (!game) {
      throw new NotFoundException('경기를 찾을 수 없습니다.');
    }
    if (game.gameStatus === 'FINISHED') {
      throw new BadRequestException('이미 끝난 경기예요.');
    }

    // 4) upsert(소유자 기준·예측 변경 허용 → 멱등).
    await this.prisma.matchPrediction.upsert({
      where: { userId_gameKey: { userId, gameKey } },
      create: { userId, gameKey, predictedWinner },
      update: { predictedWinner },
    });

    return { gameKey, predictedWinner: predictedWinner as Winner, saved: true };
  }

  /**
   * 내 예측 현황 + 적중률 — match_predictions 전체를 kbo_games 와 join 해 on-read 계산.
   *
   *   - 각 예측의 경기 상태/대진을 함께 반환.
   *   - FINISHED + 무승부 아님(homeScore != awayScore)일 때만 실제 승자 도출 → correct 판정.
   *   - stats: total(전체), finished(판정 가능), correct(적중), accuracy(correct/finished, 0→null).
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async myPredictions(
    @Req() req: RequestWithUser,
  ): Promise<MyPredictionsResult> {
    const userId = req.user.userId;

    const rows = await this.prisma.matchPrediction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { gameKey: true, predictedWinner: true },
    });

    // 예측한 경기들의 kbo_games 정보 일괄 조회(N+1 회피).
    const gameKeys = rows.map((r) => r.gameKey);
    const games =
      gameKeys.length > 0
        ? await this.prisma.kboGame.findMany({
            where: { gameKey: { in: gameKeys } },
            select: {
              gameKey: true,
              gameStatus: true,
              homeTeam: true,
              awayTeam: true,
              homeScore: true,
              awayScore: true,
            },
          })
        : [];
    const gameByKey = new Map(games.map((g) => [g.gameKey, g]));

    let finished = 0;
    let correct = 0;

    const predictions: PredictionItem[] = rows.map((row) => {
      const game = gameByKey.get(row.gameKey);
      const predictedWinner = row.predictedWinner as Winner;
      const status = game?.gameStatus ?? 'UNKNOWN';
      const matchup = game
        ? `${game.awayTeam} vs ${game.homeTeam}`
        : row.gameKey;

      const item: PredictionItem = {
        gameKey: row.gameKey,
        predictedWinner,
        status,
        matchup,
      };

      // FINISHED + 스코어 존재 + 무승부 아님일 때만 적중 판정.
      if (
        game &&
        game.gameStatus === 'FINISHED' &&
        game.homeScore != null &&
        game.awayScore != null &&
        game.homeScore !== game.awayScore
      ) {
        const actualWinner: Winner =
          game.homeScore > game.awayScore ? 'home' : 'away';
        const isCorrect = actualWinner === predictedWinner;
        item.actualWinner = actualWinner;
        item.correct = isCorrect;
        finished += 1;
        if (isCorrect) correct += 1;
      }

      return item;
    });

    return {
      predictions,
      stats: {
        total: rows.length,
        finished,
        correct,
        accuracy: finished > 0 ? correct / finished : null,
      },
    };
  }
}
