/**
 * PlayersController — 선수 상세 조회 엔드포인트 (P4-W10 10.1).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-050)
 *
 * GET /players/:playerId (JwtAuthGuard — read 지만 일관성 위해 유지)
 *  - 프론트 useCopilotAction('showPlayerDetail') 핸들러가 호출하는 백엔드 API.
 *  - playerId 숫자 검증(BadRequest), Player findUnique + 당해 시즌 배팅/피칭 스탯 include.
 *    없으면 404. ToolCallLog best-effort.
 */
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/** GET /players/:playerId 응답. */
interface PlayerDetailResult {
  player: {
    id: number;
    name: string | null;
    teamId: string | null;
    position: string | null;
  };
  batting: unknown | null;
  pitching: unknown | null;
}

@Controller('players')
export class PlayersController {
  constructor(private readonly prisma: PrismaService) {}

  /** 선수 상세 — Player + 당해 시즌 batting/pitching 스탯 반환 + ToolCallLog. */
  @UseGuards(JwtAuthGuard)
  @Get(':playerId')
  async showPlayerDetail(
    @Param('playerId') playerIdParam: string,
  ): Promise<PlayerDetailResult> {
    const start = Date.now();

    // ── playerId 숫자 검증 ──
    const playerId = Number(playerIdParam);
    if (!Number.isInteger(playerId)) {
      throw new BadRequestException('playerId 는 정수여야 합니다.');
    }

    // ── 당해 시즌 스탯만 include ──
    const season = new Date().getFullYear();
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        battingStats: { where: { season } },
        pitchingStats: { where: { season } },
      },
    });
    if (!player) {
      throw new NotFoundException('선수를 찾을 수 없습니다.');
    }

    const batting = player.battingStats[0] ?? null;
    const pitching = player.pitchingStats[0] ?? null;

    const result: PlayerDetailResult = {
      player: {
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        position: player.position,
      },
      batting,
      pitching,
    };

    // ── ToolCallLog 기록(best-effort) ──
    try {
      await this.prisma.toolCallLog.create({
        data: {
          actionName: 'showPlayerDetail',
          params: { playerId },
          result: { playerId, hasBatting: batting !== null, hasPitching: pitching !== null },
          durationMs: Date.now() - start,
        },
      });
    } catch {
      // 로그 실패는 무시 — 조회 자체는 이미 성공.
    }

    return result;
  }
}
