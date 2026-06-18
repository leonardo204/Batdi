/**
 * ProfileLearningScheduler — 장기 프로필 학습 스윕 (P3-W9 9.4).
 *
 * SSOT: Ref-docs/specs/impl/batdi-development-plan.md 9.4, CLAUDE.md best-effort 영속화 +
 *       "PersonalAgent 상태는 Write-through".
 *
 * @Cron('*\/15 * * * *', Asia/Seoul): 환경 게이트 PROFILE_LEARNING_ENABLED === 'true' 일 때만
 *   동작(기본 비활성 — 테스트/CI 의 LLM 호출 방지). 활성 시 학습 대상 PersonalAgentState 를
 *   take 상한(SWEEP_TAKE)으로 조회해 각 userId 에 learnFromConversation 을 순차 호출한다
 *   (best-effort, 한 건 실패가 다음 건을 막지 않는다). 키 없으면 learnFromConversation 이
 *   자연 no-op(daily-kbo / session-end 게이트 패턴 참고).
 *
 * ⚠️ 트리거 조건 필터링:
 *   학습 대상은 messageCount - coalesce(profileData.lastLearnedCount, 0) >= LEARN_INTERVAL(50).
 *   그런데 lastLearnedCount 는 profileData(Json) 안에 있어 Prisma where 로 직접 비교가 불가하다.
 *   → 1차로 messageCount >= LEARN_INTERVAL 후보를 DB 조회한 뒤, 코드에서 lastLearnedCount
 *     차이를 필터한다(JSON 필드 평가). take 는 후보 단계에서만 적용하되, 실제 학습 호출은
 *     필터를 통과한 대상에 한정한다.
 *
 * ⚠️ Batch API(Flash-Lite 50% 할인) 보류: 실 Gemini Batch API(잡 제출 + 폴링) 미적용 —
 *   비용 최적화 후속 과제. 현재는 동기 Flash-Lite 호출(learnFromConversation)로 처리한다.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  PersonalAgentLearningService,
  LEARN_INTERVAL,
  LAST_LEARNED_COUNT_KEY,
} from './personal-agent-learning.service';

/** 한 스윕에서 처리할 최대 사용자 수(과부하·장시간 cron 방지). */
export const SWEEP_TAKE = 50;

/** 프로필 학습 스윕 활성 게이트 환경변수. */
export const PROFILE_LEARNING_ENABLED_ENV = 'PROFILE_LEARNING_ENABLED';

@Injectable()
export class ProfileLearningScheduler {
  private readonly logger = new Logger(ProfileLearningScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly learning: PersonalAgentLearningService,
  ) {}

  /** 스윕 활성 여부 — PROFILE_LEARNING_ENABLED === 'true' 일 때만 동작. */
  private isEnabled(): boolean {
    return process.env[PROFILE_LEARNING_ENABLED_ENV] === 'true';
  }

  /**
   * 15분마다 학습 대상을 스윕한다. 게이트 비활성이면 즉시 반환(no-op).
   */
  @Cron('*/15 * * * *', { timeZone: 'Asia/Seoul' })
  async runLearningSweep(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    // 1차 후보: messageCount >= LEARN_INTERVAL(누적 50건 이상 사용자만). lastLearnedCount
    //   차이는 JSON 필드라 코드에서 2차 필터한다(아래).
    let candidates: {
      userId: string;
      messageCount: number;
      profileData: unknown;
    }[];
    try {
      candidates = await this.prisma.personalAgentState.findMany({
        where: { messageCount: { gte: LEARN_INTERVAL } },
        orderBy: { messageCount: 'desc' },
        take: SWEEP_TAKE,
        select: { userId: true, messageCount: true, profileData: true },
      });
    } catch (err) {
      this.logger.error(`프로필 학습 스윕 조회 실패: ${String(err)}`);
      return;
    }

    // 2차 필터(코드): messageCount - (profileData.lastLearnedCount ?? 0) >= LEARN_INTERVAL.
    const targets = candidates.filter((c) =>
      isLearnDue(c.messageCount, c.profileData),
    );

    if (targets.length === 0) {
      return;
    }

    this.logger.log(`프로필 학습 스윕 시작: 대상 ${targets.length}건`);
    let learned = 0;
    for (const { userId } of targets) {
      try {
        const ok = await this.learning.learnFromConversation(userId);
        if (ok) {
          learned += 1;
        }
      } catch (err) {
        // learnFromConversation 은 best-effort 라 보통 throw 안 하지만 방어적 흡수.
        this.logger.warn(`프로필 학습 실패(${userId}): ${String(err)}`);
      }
    }
    this.logger.log(`프로필 학습 스윕 완료: ${learned}/${targets.length} 갱신`);
  }
}

/**
 * 학습 트리거 판정 — messageCount - (profileData.lastLearnedCount ?? 0) >= LEARN_INTERVAL.
 * profileData 가 객체가 아니거나 키가 없으면 lastLearnedCount=0 으로 본다.
 *
 * 예) (50, {}) → 50-0=50 >= 50 → true / (60, {lastLearnedCount:50}) → 10 < 50 → false /
 *     (100, {lastLearnedCount:50}) → 50 >= 50 → true.
 */
export function isLearnDue(
  messageCount: number,
  profileData: unknown,
): boolean {
  let last = 0;
  if (profileData !== null && typeof profileData === 'object') {
    const raw = (profileData as Record<string, unknown>)[
      LAST_LEARNED_COUNT_KEY
    ];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      last = raw;
    }
  }
  return messageCount - last >= LEARN_INTERVAL;
}
