/**
 * crawler.module.ts — KBO 크롤러 전용 standalone 모듈.
 *
 * 전용 docker 컨테이너(batdi-kbo-crawler)에서 HTTP 서버 없이 크롤러만 띄우기 위한 최소 모듈.
 * 전체 AppModule(auth/copilotkit 등)을 부팅하지 않아 불필요한 env·웹 스택 의존을 제거한다.
 *
 * 구성: ScheduleModule.forRoot()(@Cron 등록) + PrismaModule(@Global) + KboModule(스크래퍼/라이터/스케줄러).
 * crawler-main.ts 가 NestFactory.createApplicationContext 로 이 모듈을 로드한다.
 */
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { KboModule } from './kbo.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, KboModule],
})
export class CrawlerModule {}
