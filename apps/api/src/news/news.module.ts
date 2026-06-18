/**
 * news.module.ts — KBO 뉴스 크롤러 모듈 (P3-W7 7.5, ADR-048).
 *
 * 스크래퍼/요약기/라이터/스케줄러를 등록한다. PrismaService 는 @Global PrismaModule 에서 주입.
 * CrawlerHealthManager 는 KboModule 이 export 하므로 KboModule import 로 공유한다
 * (소스별 health 상태를 KBO 크롤러와 동일 인스턴스로 관리 — 'news' 소스 추가됨).
 * ScheduleModule.forRoot() 는 app.module.ts 에서 1회 등록(전역 1회 제약).
 * 컨트롤러는 없다 — 온디맨드 크롤링 엔드포인트는 만들지 않는다(스케줄러만).
 */

import { Module } from '@nestjs/common';
import { KboModule } from '../kbo/kbo.module';
import { NewsRssScraper } from './news-rss.scraper';
import { NewsSummarizer } from './news.summarizer';
import { NewsWriter } from './news.writer';
import { DailyNewsScheduler } from './daily-news.scheduler';

@Module({
  imports: [KboModule],
  providers: [
    NewsRssScraper,
    NewsSummarizer,
    NewsWriter,
    DailyNewsScheduler,
  ],
  exports: [NewsRssScraper, NewsSummarizer, NewsWriter],
})
export class NewsModule {}
