/**
 * FavoritesModule — 관심 선수 등록 검증 API (P4-W10 10.1/10.2 키스톤).
 *
 * - FavoritesController: POST /favorites/register(JwtAuthGuard) — useCopilotAction 백엔드 매핑.
 * - PrismaService 는 전역 PrismaModule 에서 주입.
 * - JwtAuthGuard 적용을 위해 AuthModule 을 import(ConversationModule 패턴 재사용).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FavoritesController } from './favorites.controller';

@Module({
  imports: [AuthModule],
  controllers: [FavoritesController],
})
export class FavoritesModule {}
