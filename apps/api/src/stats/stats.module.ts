/**
 * StatsModule — 팀 비교 조회 API (P4-W10 10.1).
 *
 * - StatsController: GET /stats/compare(JwtAuthGuard) — useCopilotAction 매핑.
 * - PrismaService 는 전역 PrismaModule 에서 주입. AuthModule import(가드 적용).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StatsController } from './stats.controller';

@Module({
  imports: [AuthModule],
  controllers: [StatsController],
})
export class StatsModule {}
