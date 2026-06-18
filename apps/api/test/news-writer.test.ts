/**
 * news-writer.test.ts — NewsWriter 단위 테스트 (P3-W7 7.5, ADR-048).
 *
 * prisma.cacheNews(findUnique/upsert) + NewsSummarizer 를 모킹해 upsert(by url) 멱등·
 * summary 주입·created/modified 카운트·url 없는 행 skip·best-effort 흡수를 검증한다.
 */
import { describe, it, expect, vi } from 'vitest';
import { NewsWriter } from '../src/news/news.writer';
import type { NewsScrapeRow } from '../src/news/news-rss.scraper';

function makeRow(over: Partial<NewsScrapeRow> = {}): NewsScrapeRow {
  return {
    teamId: 'hanwha',
    title: '한화 위닝시리즈',
    url: 'https://example.com/news/1',
    source: '스포츠경향',
    publishedAt: new Date('2026-06-18T03:00:00Z'),
    ...over,
  };
}

function makeWriter(opts: {
  existing?: { id: number } | null;
  summary?: string | null;
}) {
  const findUnique = vi.fn().mockResolvedValue(opts.existing ?? null);
  const upsert = vi.fn().mockResolvedValue({ id: 1 });
  const prisma = { cacheNews: { findUnique, upsert } };
  const summarize = vi.fn().mockResolvedValue(opts.summary ?? null);
  const summarizer = { summarize };
  const writer = new NewsWriter(prisma as never, summarizer as never);
  return { writer, findUnique, upsert, summarize };
}

describe('NewsWriter.write', () => {
  it('신규 행 → create(saved=1), summary(LLM) 주입·source=google-news·expiresAt 미래', async () => {
    const { writer, upsert, summarize } = makeWriter({
      existing: null,
      summary: '한화가 위닝시리즈를 거뒀다',
    });
    const res = await writer.write([makeRow()]);

    expect(res).toEqual({ collected: 1, saved: 1, modified: 0 });
    expect(summarize).toHaveBeenCalledWith('한화 위닝시리즈');
    const arg = upsert.mock.calls[0]![0];
    expect(arg.where).toEqual({ url: 'https://example.com/news/1' });
    expect(arg.create.summary).toBe('한화가 위닝시리즈를 거뒀다');
    expect(arg.create.source).toBe('google-news');
    expect(arg.create.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('기존 행 → update(modified=1)', async () => {
    const { writer } = makeWriter({ existing: { id: 7 }, summary: '요약' });
    const res = await writer.write([makeRow()]);
    expect(res).toEqual({ collected: 1, saved: 0, modified: 1 });
  });

  it('summary null(키 없음/오류) → summary 컬럼 null 저장(throw 안 함)', async () => {
    const { writer, upsert } = makeWriter({ existing: null, summary: null });
    await writer.write([makeRow()]);
    expect(upsert.mock.calls[0]![0].create.summary).toBeNull();
  });

  it('url 없는 행 → skip(upsert 미호출)', async () => {
    const { writer, upsert } = makeWriter({ existing: null });
    const res = await writer.write([makeRow({ url: '' })]);
    expect(upsert).not.toHaveBeenCalled();
    expect(res).toEqual({ collected: 1, saved: 0, modified: 0 });
  });

  it('행별 upsert 실패는 흡수하고 다음 행 진행(best-effort)', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const upsert = vi
      .fn()
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce({ id: 2 });
    const prisma = { cacheNews: { findUnique, upsert } };
    const summarizer = { summarize: vi.fn().mockResolvedValue(null) };
    const writer = new NewsWriter(prisma as never, summarizer as never);

    const res = await writer.write([
      makeRow({ url: 'https://e.com/a' }),
      makeRow({ url: 'https://e.com/b' }),
    ]);
    // 첫 행 실패(카운트 안 됨), 둘째 행 성공(saved=1). throw 안 함.
    expect(res.collected).toBe(2);
    expect(res.saved).toBe(1);
  });
});
