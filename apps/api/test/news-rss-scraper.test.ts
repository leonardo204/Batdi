/**
 * news-rss-scraper.test.ts — NewsRssScraper 단위 테스트 (P3-W7 7.5, ADR-048).
 *
 * cheerio 파싱(parseRss)을 샘플 RSS XML 문자열로 직접 검증한다. scrapeTeamNews 는 global
 * fetch 를 모킹해 fetch→파싱 경로/실패 폴백([])을 검증한다(라이브 호출 없음).
 * buildRssUrl 은 Google News RSS 만 사용함(네이버/다음 금지)을 단언한다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  NewsRssScraper,
  buildRssUrl,
} from '../src/news/news-rss.scraper';

/** 샘플 Google News RSS(item 3건 + url 없는 1건). */
const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>KBO 한화 - Google News</title>
    <item>
      <title>한화 선발진 호투로 위닝시리즈</title>
      <link>https://example.com/news/1</link>
      <pubDate>Wed, 18 Jun 2026 03:00:00 GMT</pubDate>
      <source url="https://sports.example.com">스포츠경향</source>
    </item>
    <item>
      <title>이글스 마무리 안정세</title>
      <link>https://example.com/news/2</link>
      <pubDate>Wed, 18 Jun 2026 02:00:00 GMT</pubDate>
      <source url="https://news.example.com">뉴스1</source>
    </item>
    <item>
      <title>출처 없는 기사</title>
      <link>https://example.com/news/3</link>
      <pubDate>Wed, 18 Jun 2026 01:00:00 GMT</pubDate>
    </item>
    <item>
      <title>링크 없는 기사(스킵)</title>
      <link></link>
      <pubDate>Wed, 18 Jun 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

describe('buildRssUrl', () => {
  it('Google News RSS 검색 URL(한국어·KR) 만 생성한다(네이버/다음 미사용)', () => {
    const url = buildRssUrl('KBO 한화');
    expect(url).toContain('https://news.google.com/rss/search');
    expect(url).toContain('hl=ko');
    expect(url).toContain('gl=KR');
    expect(url).toContain('ceid=KR:ko');
    expect(url).toContain(encodeURIComponent('KBO 한화'));
    expect(url).not.toContain('naver');
    expect(url).not.toContain('daum');
  });
});

describe('NewsRssScraper.parseRss (순수 파싱)', () => {
  const scraper = new NewsRssScraper();

  it('item 의 title/link/source/pubDate 를 추출하고 link 없는 항목은 skip', () => {
    const rows = scraper.parseRss(SAMPLE_RSS, 'hanwha');
    // link 없는 마지막 항목 1건은 skip → 3건.
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      teamId: 'hanwha',
      title: '한화 선발진 호투로 위닝시리즈',
      url: 'https://example.com/news/1',
      source: '스포츠경향',
    });
    expect(rows[0]?.publishedAt).toBeInstanceOf(Date);
  });

  it('source 없는 item → source=null', () => {
    const rows = scraper.parseRss(SAMPLE_RSS, 'hanwha');
    const noSource = rows.find((r) => r.url === 'https://example.com/news/3');
    expect(noSource?.source).toBeNull();
  });

  it('teamId 인자를 각 행에 그대로 부여(일반 뉴스 null 포함)', () => {
    const rows = scraper.parseRss(SAMPLE_RSS, null);
    expect(rows.every((r) => r.teamId === null)).toBe(true);
  });

  it('빈/깨진 XML → 빈 배열(throw 안 함)', () => {
    expect(scraper.parseRss('', 'kia')).toEqual([]);
    expect(scraper.parseRss('<rss></rss>', 'kia')).toEqual([]);
  });

  it('상위 5건만 추린다(NEWS_TOP_N)', () => {
    const items = Array.from({ length: 8 }, (_, n) => `
      <item><title>기사${n}</title><link>https://e.com/${n}</link></item>`).join('');
    const xml = `<rss><channel>${items}</channel></rss>`;
    const rows = scraper.parseRss(xml, 'lotte');
    expect(rows).toHaveLength(5);
  });
});

describe('NewsRssScraper.scrapeTeamNews (fetch 모킹)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetch 성공 → RSS 파싱 결과 반환', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(SAMPLE_RSS),
      }),
    );
    const scraper = new NewsRssScraper();
    const rows = await scraper.scrapeTeamNews('hanwha', 'KBO 한화');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.title).toBe('한화 선발진 호투로 위닝시리즈');
  });

  it('HTTP 비정상(!ok) → 빈 배열(best-effort)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve('') }),
    );
    const scraper = new NewsRssScraper();
    expect(await scraper.scrapeTeamNews('kia', 'KBO 기아')).toEqual([]);
  });

  it('fetch reject → 빈 배열(throw 안 함)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const scraper = new NewsRssScraper();
    expect(await scraper.scrapeTeamNews('lotte', 'KBO 롯데')).toEqual([]);
  });
});
