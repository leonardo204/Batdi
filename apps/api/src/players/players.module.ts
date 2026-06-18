/**
 * PlayersModule — 선수 상세 조회 API (P4-W10 10.1).
 *
 * - PlayersController: GET /players/:playerId(JwtAuthGuard) — useCopilotAction 매핑.
 * - PrismaService 는 전역 PrismaModule 에서 주입. AuthModule import(가드 적용).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlayersController } from './players.controller';

@Module({
  imports: [AuthModule],
  controllers: [PlayersController],
})
export class PlayersModule {}
