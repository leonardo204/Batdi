/**
 * PushModule — Web Push 구독·전송·트리거 묶음 (P4-W11 — ADR-055).
 *
 * - PushController: subscribe/unsubscribe/vapid-public-key.
 * - PUSH_PROVIDER → LocalWebPushProvider(web-push·VAPID). P6 FCM 어댑터로 교체 가능.
 * - PushService: sendToUser/sendLevelUp 파사드 — 다른 모듈이 import 해 호출(export).
 * - PushScheduler: 경기 시작 30분 전 cron 스윕(PUSH_ENABLED 게이트).
 * - JwtAuthGuard 적용을 위해 AuthModule import(FavoritesModule 패턴 재사용).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PushController } from './push.controller';
import { LocalWebPushProvider, PUSH_PROVIDER } from './push.provider';
import { PushScheduler } from './push.scheduler';
import { PushService } from './push.service';

@Module({
  imports: [AuthModule],
  controllers: [PushController],
  providers: [
    { provide: PUSH_PROVIDER, useClass: LocalWebPushProvider },
    PushService,
    PushScheduler,
  ],
  exports: [PushService],
})
export class PushModule {}
