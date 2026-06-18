/**
 * UsersModule — 내 레벨·통계 조회 (P4-W10 10.4).
 *
 * - UsersController: GET /users/me/level, GET /users/me/stats (JwtAuthGuard).
 * - PrismaService 는 전역 PrismaModule(@Global)에서 주입.
 * - JwtAuthGuard 적용을 위해 AuthModule import(가드 + LocalAuthProvider DI).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
})
export class UsersModule {}
