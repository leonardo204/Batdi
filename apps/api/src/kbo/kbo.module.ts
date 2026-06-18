/**
 * kbo.module.ts — KBO 크롤러 모듈.
 *
 * 스크래퍼/라이터/스케줄러를 등록한다. PrismaService 는 @Global PrismaModule 에서 주입.
 * ScheduleModule.forRoot() 는 app.module.ts 에서 1회 등록(전역 1회 제약).
 * 컨트롤러는 없다 — 온디맨드 크롤링 엔드포인트는 만들지 않는다(스케줄러만).
 */

import { Module } from '@nestjs/common';
import { DailyKboScheduler } from './daily-kbo.scheduler';
import { KboScraper } from './kbo-scraper';
import { KboGameWriter, PlayerStatWriter, TeamRecordWriter } from './kbo-writer';
import { CrawlerHealthManager } from './crawler-health';

@Module({
  providers: [
    KboScraper,
    KboGameWriter,
    TeamRecordWriter,
    PlayerStatWriter,
    CrawlerHealthManager,
    DailyKboScheduler,
  ],
  exports: [KboGameWriter, TeamRecordWriter, PlayerStatWriter, CrawlerHealthManager],
})
export class KboModule {}
