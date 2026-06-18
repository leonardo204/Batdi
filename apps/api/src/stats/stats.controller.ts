/**
 * StatsController — 팀 비교 조회 엔드포인트 (P4-W10 10.1).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-050)
 *
 * GET /stats/compare?teamA=&teamB= (JwtAuthGuard)
 *  - 프론트 useCopilotAction('showTeamComparison') 핸들러가 호출하는 백엔드 API.
 *  - teamA/teamB VALID_TEAMS 화이트리스트 검증(BadRequest).
 *  - 당해 시즌 TeamSeasonRecord 2팀 조회(없으면 null). ToolCallLog best-effort.
 */
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, type RequestWithUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { requireLevel } from '../users/level-guard';

/** MVP 우선 지원 팀 화이트리스트(auth.controller VALID_TEAMS 와 일치). */
const VALID_TEAMS = ['lotte', 'doosan', 'kia', 'hanwha'] as const;
type TeamId = (typeof VALID_TEAMS)[number];

/** 팀 비교 단건 — TeamSeasonRecord 부분 투영. */
interface TeamCompare {
  team: string;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  gamesBehind: number;
}

/** GET /stats/compare 응답. */
interface CompareResult {
  teamA: TeamCompare | null;
  teamB: TeamCompare | null;
}

@Controller('stats')
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 팀 비교 — 2팀 당해 시즌 기록 반환 + ToolCallLog.
   *
   * 선수/팀 비교는 Lv4(시즌권) 해금 기능(ADR-053). req.user.userId 의 현재 level 을
   *   조회해 requireLevel(level, 4) 로 게이팅한다. 미달이면 403 { locked }.
   */
  @UseGuards(JwtAuthGuard)
  @Get('compare')
  async showTeamComparison(
    @Req() req: RequestWithUser,
    @Query('teamA') teamA: string,
    @Query('teamB') teamB: string,
  ): Promise<CompareResult> {
    const start = Date.now();

    // ── 레벨 게이팅: 선수/팀 비교는 Lv4 해금 ──
    const me = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { level: true },
    });
    requireLevel(me?.level ?? 1, 4);

    // ── 화이트리스트 검증 ──
    if (
      !teamA ||
      !teamB ||
      !VALID_TEAMS.includes(teamA as TeamId) ||
      !VALID_TEAMS.includes(teamB as TeamId)
    ) {
      throw new BadRequestException(
        `teamA/teamB 는 ${VALID_TEAMS.join('|')} 중 하나여야 합니다.`,
      );
    }

    const season = new Date().getFullYear();
    const records = await this.prisma.teamSeasonRecord.findMany({
      where: { season, team: { in: [teamA, teamB] } },
    });

    const toCompare = (team: string): TeamCompare | null => {
      const r = records.find((rec) => rec.team === team);
      if (!r) return null;
      return {
        team: r.team,
        rank: r.teamRank,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        winRate: r.winRate,
        gamesBehind: r.gamesBehind,
      };
    };

    const result: CompareResult = {
      teamA: toCompare(teamA),
      teamB: toCompare(teamB),
    };

    // ── ToolCallLog 기록(best-effort) ──
    try {
      await this.prisma.toolCallLog.create({
        data: {
          actionName: 'showTeamComparison',
          params: { teamA, teamB },
          result: {
            teamA: result.teamA?.rank ?? null,
            teamB: result.teamB?.rank ?? null,
          },
          durationMs: Date.now() - start,
        },
      });
    } catch {
      // 로그 실패는 무시.
    }

    return result;
  }
}
