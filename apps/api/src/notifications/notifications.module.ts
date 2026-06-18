/**
 * NotificationsModule — 푸시 알림 토글 검증 API (P4-W10 10.1).
 *
 * - NotificationsController: POST /notifications/toggle(JwtAuthGuard) — useCopilotAction 매핑.
 * - PrismaService 는 전역 PrismaModule 에서 주입.
 * - JwtAuthGuard 적용을 위해 AuthModule 을 import(FavoritesModule 패턴 재사용).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
