/**
 * daily-news.scheduler.ts — KBO 뉴스 30분 배치 스케줄러 (P3-W7 7.5, ADR-048).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-048.
 *
 * ⚠️ DEPRECATED (ADR-058): news intent 의 실데이터는 agent 의 Gemini Google Search
 *    grounding(news-search.ts → cache_news queryKey TTL)으로 **대체**됐다. 이 RSS 배치
 *    스케줄러는 보조/비활성 경로다 — NEWS_CRAWLER_ENABLED 가 'true' 가 아니면 no-op(기본 off).
 *    코드는 보존하되 배선/기본 동작은 변경하지 않는다(향후 보강 채널로 남겨둠).
 *
 * - @Cron('*\/30 * * * *', Asia/Seoul): 30분마다 Google News RSS(4팀) 크롤 → 요약 → cache_news upsert.
 * - NEWS_CRAWLER_ENABLED 가 'true' 가 아니면 no-op + 로깅(CI/테스트/로컬 부팅 라이브 호출 차단).
 * - withHealthGate('news'): daily-kbo.scheduler 패턴 동일 — scrapeAll 0건=recordFailure,
 *   >0=recordSuccess. 연속 3회 실패 시 CrawlerHealthManager 가 자동 비활성(graceful degradation).
 *
 * ⚠️ 온디맨드 크롤링 엔드포인트는 만들지 않는다(컨트롤러 없음, 스케줄러만).
 * best-effort: 모든 크롤/요약/DB 실패는 흡수(throw 금지).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NewsRssScraper, type NewsScrapeRow } from './news-rss.scraper';
import { NewsWriter } from './news.writer';
import { NEWS_CRAWLER_ENABLED_ENV } from './news.constants';
import { CrawlerHealthManager, type CrawlSource } from '../kbo/crawler-health';

@Injectable()
export class DailyNewsScheduler {
  private readonly logger = new Logger(DailyNewsScheduler.name);

  constructor(
    private readonly scraper: NewsRssScraper,
    private readonly writer: NewsWriter,
    private readonly health: CrawlerHealthManager,
  ) {}

  /** 크롤러 활성 여부 — NEWS_CRAWLER_ENABLED === 'true' 일 때만 동작. */
  private isEnabled(): boolean {
    return process.env[NEWS_CRAWLER_ENABLED_ENV] === 'true';
  }

  /**
   * 소스 health 게이트 + 성공/실패 판정(daily-kbo.scheduler.withHealthGate 동일 패턴).
   * 비활성(연속 3회 실패) 소스는 skip → undefined. scraper 는 빈 배열 반환이라 0건=실패.
   */
  private async withHealthGate<T>(
    source: CrawlSource,
    crawl: () => Promise<T[]>,
  ): Promise<T[] | undefined> {
    if (!this.health.isEnabled(source)) {
      this.logger.warn(`소스 ${source} 비활성 — 크롤 skip(graceful degradation)`);
      return undefined;
    }
    const rows = await crawl();
    if (rows.length > 0) {
      this.health.recordSuccess(source);
    } else {
      this.health.recordFailure(source);
    }
    return rows;
  }

  /**
   * 30분마다 Google News RSS 크롤 → cache_news 적재.
   */
  @Cron('*/30 * * * *', { timeZone: 'Asia/Seoul' })
  async runBatch(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.log(
        `${NEWS_CRAWLER_ENABLED_ENV} != 'true' — 뉴스 크롤링 생략(no-op)`,
      );
      return;
    }

    this.logger.log('KBO 뉴스 크롤링 시작(Google News RSS, 4팀 순차)');

    try {
      const rows = (await this.withHealthGate('news', () =>
        this.scraper.scrapeAll(),
      )) as NewsScrapeRow[] | undefined;

      if (rows && rows.length > 0) {
        await this.writer.write(rows);
      }

      this.logger.log('KBO 뉴스 크롤링 완료');
    } catch (err) {
      // best-effort — 스케줄러는 throw 하지 않는다.
      this.logger.error(`KBO 뉴스 크롤링 오류: ${String(err)}`);
    }
  }
}
