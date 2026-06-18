/**
 * ConversationController — 명시적 세션 종료 엔드포인트 (P3-W9 9.3).
 *
 * POST /conversations/:id/end (JwtAuthGuard)
 *  - 본인(req.user.userId == conversation.userId) 검증 후 즉시 세션 최종 요약.
 *  - 대화 없음 → 404, 타인 소유 → 403. 요약 결과 { summary } 반환(키 없음/실패 시 summary=null).
 *
 * GET /conversations (JwtAuthGuard) — P4-W10 10.4
 *  - 본인(req.user.userId) 의 대화 목록을 updatedAt desc, take 50 으로 반환.
 *  - 각 항목 { id, title, summary, updatedAt, messageCount(_count.messages) }.
 *  - 검색(platform-ops §12.3): ?q= 가 있으면 제목/요약/메시지 content 부분일치(ILIKE)로
 *    소유자 범위 내 필터(updatedAt desc, take 50). q 없으면 기존 전체 목록.
 *
 * DELETE /conversations/:id (JwtAuthGuard) — platform-ops §12.3
 *  - 본인 소유 검증 후 삭제. 없음 → 404, 타인 → 403. messages 는 onDelete Cascade.
 *  - 반환 { deleted: true }.
 *
 * 명시적 종료는 idle/자정 스윕과 달리 게이트(SESSION_SUMMARY_ENABLED) 없이 즉시 동작한다
 *   (사용자 의도 종료). 단 키 없으면 summarizeConversation 이 null 을 반환한다(no-op).
 */
import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, type RequestWithUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationSummaryService } from './conversation-summary.service';

/** GET /conversations 목록 항목. */
export interface ConversationListItem {
  id: string;
  title: string | null;
  summary: string | null;
  updatedAt: Date;
  messageCount: number;
}

@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly summary: ConversationSummaryService,
  ) {}

  /**
   * 내 대화 목록 — 소유자(req.user.userId) 범위, updatedAt desc, take 50.
   * q 가 있으면 제목/요약/메시지 content 부분일치(ILIKE)로 소유자 범위 내 필터한다.
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  async list(
    @Req() req: RequestWithUser,
    @Query('q') q?: string,
  ): Promise<ConversationListItem[]> {
    const term = q?.trim();
    const where = term
      ? {
          userId: req.user.userId,
          OR: [
            { title: { contains: term, mode: 'insensitive' as const } },
            { summary: { contains: term, mode: 'insensitive' as const } },
            {
              messages: {
                some: {
                  content: { contains: term, mode: 'insensitive' as const },
                },
              },
            },
          ],
        }
      : { userId: req.user.userId };

    const conversations = await this.prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        summary: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      summary: c.summary,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
    }));
  }

  /** 대화 삭제 — 소유자 검증 후 삭제(messages Cascade). 없음 404 / 타인 403. */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<{ deleted: true }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!conversation) {
      throw new NotFoundException('대화를 찾을 수 없습니다.');
    }
    if (conversation.userId !== req.user.userId) {
      throw new ForbiddenException('본인 대화만 삭제할 수 있습니다.');
    }

    await this.prisma.conversation.delete({ where: { id } });
    return { deleted: true };
  }

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
