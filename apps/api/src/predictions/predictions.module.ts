/**
 * PredictionsModule — 경기 예측 + 적중률 API (ADR-054, Lv2 해금).
 *
 * - PredictionsController: POST /predictions(requireLevel 2) · GET /predictions/me(JwtAuthGuard).
 * - PrismaService 는 전역 PrismaModule 에서 주입.
 * - JwtAuthGuard 적용을 위해 AuthModule 을 import(FavoritesModule 패턴 재사용).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PredictionsController } from './predictions.controller';

@Module({
  imports: [AuthModule],
  controllers: [PredictionsController],
})
export class PredictionsModule {}
