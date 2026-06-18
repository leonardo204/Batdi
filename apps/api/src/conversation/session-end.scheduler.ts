/**
 * SessionEndScheduler — 세션 종료 트리거 스윕 (P3-W9 9.3).
 *
 * SSOT: Ref-docs/specs/impl/batdi-development-plan.md 9.3, CLAUDE.md best-effort 영속화.
 *
 * 두 가지 cron 스윕(Asia/Seoul). 각 대상 Conversation 에 대해
 * ConversationSummaryService.summarizeConversation 을 순차 호출한다(best-effort).
 *
 *  A. idle 스윕(*\/10 * * * *): updatedAt < now-30분 AND 미요약/갱신분(summarizedAt null OR
 *     summarizedAt < updatedAt) AND 메시지 1건 이상 → 최대 SWEEP_TAKE 건.
 *  B. 자정 스윕(0 0 * * *): idle 조건 없이, 미요약/갱신분 전체(메시지 1건 이상) → 하루 마감 요약.
 *
 * 환경 게이트: SESSION_SUMMARY_ENABLED === 'true' 일 때만 동작(기본 비활성 — 테스트/CI 에서
 *   LLM 호출 방지). 키 없으면 summarizeConversation 이 자연히 no-op(daily-kbo 게이트 패턴 참고).
 *
 * 재요약 멱등성은 WHERE 절(summarizedAt null OR summarizedAt < updatedAt)로 강제 — 새 메시지로
 *   updated_at 이 갱신돼야 다시 대상이 된다(매 스윕 중복 요약 방지).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationSummaryService } from './conversation-summary.service';

/** idle 판정 임계(분). updatedAt 이 now 보다 이 분 이상 과거면 종료된 세션으로 본다. */
export const IDLE_MINUTES = 30;

/** 한 스윕에서 처리할 최대 대화 수(과부하·장시간 cron 방지). */
export const SWEEP_TAKE = 50;

/** 세션 요약 스윕 활성 게이트 환경변수. */
export const SESSION_SUMMARY_ENABLED_ENV = 'SESSION_SUMMARY_ENABLED';

@Injectable()
export class SessionEndScheduler {
  private readonly logger = new Logger(SessionEndScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly summary: ConversationSummaryService,
  ) {}

  /** 스윕 활성 여부 — SESSION_SUMMARY_ENABLED === 'true' 일 때만 동작. */
  private isEnabled(): boolean {
    return process.env[SESSION_SUMMARY_ENABLED_ENV] === 'true';
  }

  /**
   * idle 스윕 — 10분마다. 30분 이상 비활성 + 미요약/갱신분 대화를 마감 요약한다.
   */
  @Cron('*/10 * * * *', { timeZone: 'Asia/Seoul' })
  async runIdleSweep(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    const idleBefore = new Date(Date.now() - IDLE_MINUTES * 60 * 1000);
    await this.sweep('idle', idleBefore);
  }

  /**
   * 자정 스윕 — 매일 00:00 KST. idle 조건 없이 미요약/갱신분 전체를 하루 마감 요약한다.
   */
  @Cron('0 0 * * *', { timeZone: 'Asia/Seoul' })
  async runMidnightSweep(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.sweep('midnight', null);
  }

  /**
   * 공통 스윕 — 미요약/갱신분(+ idleBefore 가 있으면 updatedAt < idleBefore) 대화를 찾아
   * 각각 순차 요약한다(best-effort). 한 건 실패가 다음 건을 막지 않는다.
   *
   * @param label     로깅용 라벨('idle' | 'midnight')
   * @param idleBefore idle 컷오프(있으면 updatedAt < idleBefore 만 대상). null 이면 idle 무시.
   */
  private async sweep(label: string, idleBefore: Date | null): Promise<void> {
    let targets: { id: string }[];
    try {
      targets = await this.prisma.conversation.findMany({
        where: {
          // 메시지 1건 이상(빈 대화 제외).
          messages: { some: {} },
          // 미요약 OR 새 메시지로 갱신된 분(재요약 멱등성).
          OR: [
            { summarizedAt: null },
            { summarizedAt: { lt: this.prisma.conversation.fields.updatedAt } },
          ],
          // idle 컷오프(idle 스윕만).
          ...(idleBefore ? { updatedAt: { lt: idleBefore } } : {}),
        },
        orderBy: { updatedAt: 'asc' },
        take: SWEEP_TAKE,
        select: { id: true },
      });
    } catch (err) {
      this.logger.error(`${label} 스윕 조회 실패: ${String(err)}`);
      return;
    }

    if (targets.length === 0) {
      return;
    }

    this.logger.log(`${label} 스윕 시작: 대상 ${targets.length}건`);
    let summarized = 0;
    for (const { id } of targets) {
      try {
        const result = await this.summary.summarizeConversation(id);
        if (result !== null) {
          summarized += 1;
        }
      } catch (err) {
        // summarizeConversation 은 best-effort 라 보통 throw 안 하지만 방어적 흡수.
        this.logger.warn(`${label} 스윕 요약 실패(${id}): ${String(err)}`);
      }
    }
    this.logger.log(`${label} 스윕 완료: ${summarized}/${targets.length} 요약`);
  }
}
