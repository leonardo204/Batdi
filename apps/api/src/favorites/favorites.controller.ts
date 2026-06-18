/**
 * FavoritesController — 관심 선수 등록 검증 엔드포인트 (P4-W10 10.1/10.2 키스톤 수직 슬라이스).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-050)
 *
 * POST /favorites/register (JwtAuthGuard)
 *  - 프론트 useCopilotAction('registerFavoritePlayer') 핸들러가 호출하는 백엔드 검증 API.
 *    키스톤 흐름: 프론트 액션 → LLM tool_call(manually_emit_tool_call) → 클라 핸들러 →
 *    이 엔드포인트 → user_favorites upsert + tool_call_logs 기록.
 *  - playerId 숫자 검증(BadRequest), Player 존재 검증(NotFound), 본인(req.user.userId) 기준 upsert.
 *  - 실행 후 ToolCallLog 를 best-effort 로 기록(실패 무시 — 본 응답에 영향 없음).
 *
 * ⚠️ LLM 악용 방지: 액션 파라미터는 서버에서 재검증한다(타입/존재). 소유자는 항상 req.user.userId.
 */
import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, type RequestWithUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/** POST /favorites/register 요청 바디. */
interface RegisterFavoriteBody {
  playerId?: unknown;
}

/** POST /favorites/register 응답. */
interface RegisterFavoriteResult {
  success: true;
  favoritesCount: number;
}

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly prisma: PrismaService) {}

  /** 관심 선수 등록(소유자=req.user) → upsert + count + ToolCallLog 기록. */
  @UseGuards(JwtAuthGuard)
  @Post('register')
  async registerFavoritePlayer(
    @Req() req: RequestWithUser,
    @Body() body: RegisterFavoriteBody,
  ): Promise<RegisterFavoriteResult> {
    const start = Date.now();
    const userId = req.user.userId;

    // ── playerId 숫자 검증 ──
    // JSON 으로 number/문자 number 둘 다 방어. 정수 아님/NaN → BadRequest.
    const playerId =
      typeof body.playerId === 'number'
        ? body.playerId
        : typeof body.playerId === 'string'
          ? Number(body.playerId)
          : NaN;
    if (!Number.isInteger(playerId)) {
      throw new BadRequestException('playerId 는 정수여야 합니다.');
    }

    // ── Player 존재 검증 ──
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (!player) {
      throw new NotFoundException('선수를 찾을 수 없습니다.');
    }

    // ── upsert(본인 기준) — 이미 있으면 멱등, 없으면 explicit 등록 ──
    await this.prisma.userFavorite.upsert({
      where: { userId_playerId: { userId, playerId } },
      create: { userId, playerId, source: 'explicit' },
      update: {},
    });

    const favoritesCount = await this.prisma.userFavorite.count({
      where: { userId },
    });

    const result: RegisterFavoriteResult = { success: true, favoritesCount };

    // ── ToolCallLog 기록(best-effort) ──
    // 키스톤 관측: 액션 호출 경로를 tool_call_logs 에 남긴다. 실패는 무시(응답 우선).
    try {
      await this.prisma.toolCallLog.create({
        data: {
          actionName: 'registerFavoritePlayer',
          params: { playerId },
          result: { success: result.success, favoritesCount },
          durationMs: Date.now() - start,
        },
      });
    } catch {
      // 로그 실패는 무시 — 등록 자체는 이미 성공.
    }

    return result;
  }
}
