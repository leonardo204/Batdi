/**
 * ConversationModule — 세션 종료 트리거 + 최종 요약 (9.3) + 장기 프로필 학습 (9.4).
 *
 * - ConversationSummaryService: 세션 최종 요약기(Flash-Lite, best-effort) — 9.3.
 * - SessionEndScheduler: idle(10분 주기, 30분 idle) + 자정 cron 스윕(게이트 SESSION_SUMMARY_ENABLED) — 9.3.
 * - PersonalAgentLearningService: 50건마다 장기 프로필 갱신(Flash-Lite, best-effort) — 9.4.
 * - ProfileLearningScheduler: 15분 주기 학습 스윕(게이트 PROFILE_LEARNING_ENABLED) — 9.4.
 * - ConversationController: POST /conversations/:id/end 명시적 종료(JwtAuthGuard).
 *
 * 9.4 를 별도 personal-agent 모듈로 분리하지 않고 여기 합친 이유: Flash-Lite 호출 패턴·cron 스윕·
 *   AuthModule/PrismaModule 배선이 9.3 과 동일 라이프사이클(대화 기반 개인화 영속화)이라 책임이
 *   일관된다. PrismaService 는 전역 PrismaModule 에서 주입. JwtAuthGuard 적용을 위해 AuthModule
 *   을 import. ScheduleModule.forRoot() 는 app.module.ts 1회 등록.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationSummaryService } from './conversation-summary.service';
import { SessionEndScheduler } from './session-end.scheduler';
import { PersonalAgentLearningService } from './personal-agent-learning.service';
import { ProfileLearningScheduler } from './profile-learning.scheduler';
import { ConversationController } from './conversation.controller';

@Module({
  imports: [AuthModule],
  controllers: [ConversationController],
  providers: [
    ConversationSummaryService,
    SessionEndScheduler,
    PersonalAgentLearningService,
    ProfileLearningScheduler,
  ],
  exports: [ConversationSummaryService, PersonalAgentLearningService],
})
export class ConversationModule {}
