import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { KboModule } from './kbo/kbo.module';
import { NewsModule } from './news/news.module';
import { ConversationModule } from './conversation/conversation.module';
import { FavoritesModule } from './favorites/favorites.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlayersModule } from './players/players.module';
import { PredictionsModule } from './predictions/predictions.module';
import { ScoresModule } from './scores/scores.module';
import { StatsModule } from './stats/stats.module';
import { UsersModule } from './users/users.module';

// CopilotKit v2 런타임은 NestJS 컨트롤러가 아니라 Express Router 로 마운트한다
// (main.ts 의 app.use). v2 멀티라우트 정규식 매칭이 NestJS 라우터와 충돌하지 않도록
// 분리한 것 — createCopilotKitRouter() 참조.
@Module({
  imports: [
    // 전역 1회: @nestjs/schedule 의 cron 등록 활성화.
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    KboModule,
    NewsModule,
    ConversationModule,
    FavoritesModule,
    NotificationsModule,
    PlayersModule,
    PredictionsModule,
    ScoresModule,
    StatsModule,
    UsersModule,
  ],
  controllers: [AppController, HealthController],
  providers: [],
})
export class AppModule {}
