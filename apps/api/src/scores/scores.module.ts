/**
 * ScoresModule — 스코어 강제 갱신 API (P4-W10 10.1).
 *
 * - ScoresController: POST /scores/refresh(JwtAuthGuard) — useCopilotAction 매핑.
 * - PrismaService 는 전역 PrismaModule 에서 주입. AuthModule import(가드 적용).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScoresController } from './scores.controller';

@Module({
  imports: [AuthModule],
  controllers: [ScoresController],
})
export class ScoresModule {}
