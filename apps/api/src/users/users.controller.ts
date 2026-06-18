/**
 * UsersController — 내 레벨·통계 조회 (P4-W10 10.4).
 *
 * SSOT: Ref-docs/specs/design/batdi-development-plan.md P4-W10 10.4
 *
 * - GET /users/me/level  (JwtAuthGuard) → 레벨/XP/진척률/해금/전체 레벨 히스토리.
 * - GET /users/me/stats  (JwtAuthGuard) → 대화수/메시지수/턴/관심선수수/레벨/XP.
 *
 * 소유자 범위: 항상 req.user.userId 기준(JWT). 레벨/XP 는 message_count 에서 재계산하지
 *   않고 User.xpPoints(write-through SSOT) 를 신뢰한다. (xpPoints 가 0 이면 Lv1.)
 *
 * 미구현(MVP): 예측 적중률·연속 활동일·활동 시간대는 데이터 소스 미구축이라 응답에서 제외.
 *   추후 prediction/activity 집계 추가 시 stats 에 필드 확장.
 */
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type RequestWithUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { buildLevelInfo, type LevelInfo } from './level-rules';

/** GET /users/me/stats 응답. */
export interface UserStats {
  conversationCount: number;
  messageCount: number;
  turns: number;
  favoriteCount: number;
  level: number;
  xp: number;
}

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  /** 내 레벨 정보 — User.xpPoints 로 레벨/진척률/해금 계산. */
  @UseGuards(JwtAuthGuard)
  @Get('me/level')
  async myLevel(@Req() req: RequestWithUser): Promise<LevelInfo> {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { xpPoints: true },
    });
    return buildLevelInfo(user?.xpPoints ?? 0);
  }

  /** 내 통계 — 대화/메시지/턴/관심선수/레벨 집계(소유자 범위). */
  @UseGuards(JwtAuthGuard)
  @Get('me/stats')
  async myStats(@Req() req: RequestWithUser): Promise<UserStats> {
    const userId = req.user.userId;

    const [user, state, conversationCount, favoriteCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { level: true, xpPoints: true },
      }),
      this.prisma.personalAgentState.findUnique({
        where: { userId },
        select: { messageCount: true },
      }),
      this.prisma.conversation.count({ where: { userId } }),
      this.prisma.userFavorite.count({ where: { userId } }),
    ]);

    const messageCount = state?.messageCount ?? 0;
    const xp = user?.xpPoints ?? 0;

    return {
      conversationCount,
      messageCount,
      // turns = floor(messageCount/2) (user+assistant=2/턴).
      turns: Math.floor(messageCount / 2),
      favoriteCount,
      level: user?.level ?? 1,
      xp,
    };
  }
}
