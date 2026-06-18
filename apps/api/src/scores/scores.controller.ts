/**
 * ScoresController — 스코어 강제 갱신(L0 캐시 무효화) 엔드포인트 (P4-W10 10.1).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-050)
 *
 * POST /scores/refresh (JwtAuthGuard)
 *  - 프론트 useCopilotAction('requestScoreRefresh') 핸들러가 호출하는 백엔드 API.
 *  - gameId(=KboGame.gameKey) 존재 검증(NotFound).
 *  - L0 캐시 무효화: cache_ui_envelopes 에서 score intent + 해당 경기 팀 관련 행 best-effort
 *    삭제(키 패턴 정확 매칭 어려우면 intent='score' && teamId in [home,away] 로 삭제, 실패 무시).
 *  - ToolCallLog best-effort. 반환 {gameId, refreshed:true}.
 */
import {
  Body,
  Controller,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/** POST /scores/refresh 요청 바디. */
interface RefreshBody {
  gameId?: unknown;
}

/** POST /scores/refresh 응답. */
interface RefreshResult {
  gameId: string;
  refreshed: true;
}

@Controller('scores')
export class ScoresController {
  constructor(private readonly prisma: PrismaService) {}

  /** 스코어 강제 갱신 — 경기 검증 + L0 캐시 무효화 + ToolCallLog. */
  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  async requestScoreRefresh(@Body() body: RefreshBody): Promise<RefreshResult> {
    const start = Date.now();

    // ── gameId 검증 ──
    if (typeof body.gameId !== 'string' || body.gameId.trim() === '') {
      throw new NotFoundException('경기를 찾을 수 없습니다.');
    }
    const gameId = body.gameId.trim();

    // ── KboGame(gameKey) 존재 검증 ──
    const game = await this.prisma.kboGame.findUnique({
      where: { gameKey: gameId },
      select: { homeTeam: true, awayTeam: true },
    });
    if (!game) {
      throw new NotFoundException('경기를 찾을 수 없습니다.');
    }

    // ── L0 캐시 무효화(best-effort) ──
    // 키 정확 매칭이 어려우므로 intent='score' && 해당 경기 두 팀 관련 envelope 삭제.
    let invalidated = 0;
    try {
      const deleted = await this.prisma.cacheUiEnvelope.deleteMany({
        where: {
          intent: 'score',
          teamId: { in: [game.homeTeam, game.awayTeam] },
        },
      });
      invalidated = deleted.count;
    } catch {
      // 캐시 무효화 실패는 무시 — 다음 TTL 만료 시 자연 갱신.
    }

    const result: RefreshResult = { gameId, refreshed: true };

    // ── ToolCallLog 기록(best-effort) ──
    try {
      await this.prisma.toolCallLog.create({
        data: {
          actionName: 'requestScoreRefresh',
          params: { gameId },
          result: { gameId, refreshed: true, invalidated },
          durationMs: Date.now() - start,
        },
      });
    } catch {
      // 로그 실패는 무시.
    }

    return result;
  }
}
