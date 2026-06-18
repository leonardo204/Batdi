/**
 * daily-news-scheduler.test.ts — DailyNewsScheduler 단위 테스트 (P3-W7 7.5, ADR-048).
 *
 * - NEWS_CRAWLER_ENABLED 게이트: 미설정 → no-op(scrapeAll/write 미호출).
 * - enabled + scrapeAll>0건 → recordSuccess + writer.write 호출.
 * - enabled + scrapeAll 0건 → recordFailure + writer.write 미호출.
 * - 소스 비활성(isEnabled=false) → 크롤 skip(scrapeAll 미호출).
 * scraper/writer/health 모두 모킹(라이브 호출 없음).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DailyNewsScheduler } from '../src/news/daily-news.scheduler';
import type { NewsScrapeRow } from '../src/news/news-rss.scraper';

function makeRow(): NewsScrapeRow {
  return {
    teamId: 'hanwha',
    title: 't',
    url: 'https://e.com/1',
    source: 's',
    publishedAt: new Date(),
  };
}

function makeMocks(opts: {
  scraped?: NewsScrapeRow[];
  healthEnabled?: boolean;
}) {
  const scrapeAll = vi.fn().mockResolvedValue(opts.scraped ?? []);
  const scraper = { scrapeAll };
  const write = vi.fn().mockResolvedValue({ collected: 0, saved: 0, modified: 0 });
  const writer = { write };
  const recordSuccess = vi.fn();
  const recordFailure = vi.fn();
  const isEnabled = vi.fn().mockReturnValue(opts.healthEnabled ?? true);
  const health = { recordSuccess, recordFailure, isEnabled };
  const scheduler = new DailyNewsScheduler(
    scraper as never,
    writer as never,
    health as never,
  );
  return { scheduler, scrapeAll, write, recordSuccess, recordFailure, isEnabled };
}

describe('DailyNewsScheduler.runBatch', () => {
  const prev = process.env.NEWS_CRAWLER_ENABLED;

  beforeEach(() => {
    delete process.env.NEWS_CRAWLER_ENABLED;
  });
  afterEach(() => {
    if (prev === undefined) {
      delete process.env.NEWS_CRAWLER_ENABLED;
    } else {
      process.env.NEWS_CRAWLER_ENABLED = prev;
    }
  });

  it('NEWS_CRAWLER_ENABLED 미설정 → no-op(scrapeAll/write 미호출)', async () => {
    const { scheduler, scrapeAll, write } = makeMocks({});
    await scheduler.runBatch();
    expect(scrapeAll).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('enabled + scrapeAll>0 → recordSuccess + writer.write 호출', async () => {
    process.env.NEWS_CRAWLER_ENABLED = 'true';
    const { scheduler, scrapeAll, write, recordSuccess, recordFailure } =
      makeMocks({ scraped: [makeRow(), makeRow()] });
    await scheduler.runBatch();
    expect(scrapeAll).toHaveBeenCalledOnce();
    expect(recordSuccess).toHaveBeenCalledWith('news');
    expect(recordFailure).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledOnce();
  });

  it('enabled + scrapeAll 0건 → recordFailure + writer.write 미호출', async () => {
    process.env.NEWS_CRAWLER_ENABLED = 'true';
    const { scheduler, write, recordSuccess, recordFailure } = makeMocks({
      scraped: [],
    });
    await scheduler.runBatch();
    expect(recordFailure).toHaveBeenCalledWith('news');
    expect(recordSuccess).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('소스 비활성(isEnabled=false) → 크롤 skip(scrapeAll/write 미호출)', async () => {
    process.env.NEWS_CRAWLER_ENABLED = 'true';
    const { scheduler, scrapeAll, write, recordSuccess, recordFailure } =
      makeMocks({ healthEnabled: false });
    await scheduler.runBatch();
    expect(scrapeAll).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(recordSuccess).not.toHaveBeenCalled();
    expect(recordFailure).not.toHaveBeenCalled();
  });
});
