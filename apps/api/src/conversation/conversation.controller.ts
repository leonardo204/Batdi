/**
 * ConversationController — 명시적 세션 종료 엔드포인트 (P3-W9 9.3).
 *
 * POST /conversations/:id/end (JwtAuthGuard)
 *  - 본인(req.user.userId == conversation.userId) 검증 후 즉시 세션 최종 요약.
 *  - 대화 없음 → 404, 타인 소유 → 403. 요약 결과 { summary } 반환(키 없음/실패 시 summary=null).
 *
 * 명시적 종료는 idle/자정 스윕과 달리 게이트(SESSION_SUMMARY_ENABLED) 없이 즉시 동작한다
 *   (사용자 의도 종료). 단 키 없으면 summarizeConversation 이 null 을 반환한다(no-op).
 */
import {
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, type RequestWithUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationSummaryService } from './conversation-summary.service';

@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly summary: ConversationSummaryService,
  ) {}

  /** 명시적 세션 종료 → 소유자 검증 후 즉시 최종 요약. */
  @UseGuards(JwtAuthGuard)
  @Post(':id/end')
  async endSession(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<{ summary: string | null }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!conversation) {
      throw new NotFoundException('대화를 찾을 수 없습니다.');
    }
    if (conversation.userId !== req.user.userId) {
      throw new ForbiddenException('본인 대화만 종료할 수 있습니다.');
    }

    const summary = await this.summary.summarizeConversation(id);
    return { summary };
  }
}
