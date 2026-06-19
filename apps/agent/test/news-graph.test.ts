/**
 * NewsGraph v2 서비스 단위테스트 (ADR-058 — Gemini grounding + cache_news TTL)
 *
 * 순수 포맷 함수(formatNewsLine)는 DB 없이 직접 검증한다. fetchNewsData 는:
 *  - cache HIT: getPrisma.findMany → rows 변환(LLM 미호출).
 *  - MISS → searchNews(모킹) → cache 저장(createMany) + rows.
 *  - 둘 다 실패(캐시 빈 + searchNews null) → null(best-effort, throw 안 함).
 *
 * grounding(searchNews)은 모킹한다(라이브 호출은 probe 스크립트로만 — 결정론 테스트 유지).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const createMany = vi.fn();
const getPrismaMock = vi.fn();
const searchNewsMock = vi.fn();

vi.mock('../src/utils/prisma', () => ({
  getPrisma: () => getPrismaMock(),
}));

vi.mock('../src/services/news-search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/news-search')>();
  return {
    ...actual,
    searchNews: (query: string) => searchNewsMock(query),
  };
});

import {
  formatNewsLine,
  fetchNewsData,
  type CacheNewsRow,
} from '../src/services/news-graph';
import { extractNewsQuery } from '../src/services/news-search';
import type { NewsItem } from '../src/services/news-search';

function makeRow(over: Partial<CacheNewsRow> = {}): CacheNewsRow {
  return {
    title: '한화 위닝시리즈 달성',
    summary: '한화가 위닝시리즈를 거뒀다',
    source: '스포츠경향',
    ...over,
  };
}

describe('formatNewsLine (순수)', () => {
  it('summary 우선 + 출처 포맷("요약 — 출처")', () => {
    expect(formatNewsLine(makeRow())).toBe(
      '한화가 위닝시리즈를 거뒀다 — 스포츠경향',
    );
  });

  it('summary 없으면 title 폴백', () => {
    expect(formatNewsLine(makeRow({ summary: null }))).toBe(
      '한화 위닝시리즈 달성 — 스포츠경향',
    );
  });

  it('source 없으면 "뉴스" 폴백', () => {
    expect(formatNewsLine(makeRow({ source: null }))).toContain('— 뉴스');
  });

  it('title/summary 모두 없으면 "뉴스 — ..." 폴백(throw 안 함)', () => {
    expect(formatNewsLine({ title: null, summary: null, source: '연합' })).toBe(
      '뉴스 — 연합',
    );
  });

  it('과도하게 긴 줄은 말줄임(…)', () => {
    const long = 'x'.repeat(200);
    const line = formatNewsLine(makeRow({ summary: long }));
    expect(line.length).toBeLessThanOrEqual(80);
    expect(line.endsWith('…')).toBe(true);
  });

  it('NewsItem(요약 없음) 도 title — source 로 포맷', () => {
    const item: NewsItem = { title: '오타니 멀티홈런', source: '엠스플' };
    expect(formatNewsLine(item)).toBe('오타니 멀티홈런 — 엠스플');
  });
});

describe('fetchNewsData v2 (cache HIT / MISS→grounding / 폴백)', () => {
  beforeEach(() => {
    findMany.mockReset();
    createMany.mockReset();
    getPrismaMock.mockReset();
    searchNewsMock.mockReset();
    getPrismaMock.mockReturnValue({ cacheNews: { findMany, createMany } });
  });

  it('cache HIT(미만료 rows 존재) → searchNews 미호출 + rows 5슬롯 패딩', async () => {
    findMany.mockResolvedValue([
      makeRow({ summary: 'A 요약', source: 'src1' }),
      makeRow({ summary: 'B 요약', source: 'src2' }),
    ]);
    const q = extractNewsQuery('한화 뉴스', 'hanwha');
    const data = await fetchNewsData(q, 'hanwha');

    expect(searchNewsMock).not.toHaveBeenCalled();
    expect(data?.rows).toHaveLength(5);
    expect(data?.rows[0]).toEqual({ line: 'A 요약 — src1' });
    expect(data?.rows[2]).toEqual({ line: ' ' }); // 패딩
    // queryKey + 미만료 필터로 조회.
    const arg = findMany.mock.calls[0]![0];
    expect(arg.where.queryKey).toBe(q.queryKey);
    expect(arg.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(arg.take).toBe(5);
  });

  it('cache MISS → searchNews 호출 → createMany 저장 + rows 반환', async () => {
    findMany.mockResolvedValue([]); // 캐시 비어있음
    const items: NewsItem[] = [
      { title: '한화 역전승', source: '뉴시스', url: 'https://x/1' },
      { title: '한화 선발 호투', source: '엑스포츠', url: 'https://x/2' },
    ];
    searchNewsMock.mockResolvedValue(items);

    const q = extractNewsQuery('한화 뉴스 알려줘', 'hanwha');
    const data = await fetchNewsData(q, 'hanwha');

    expect(searchNewsMock).toHaveBeenCalledWith(q.query);
    // 저장: queryKey·source='gemini-grounding'·teamId.
    expect(createMany).toHaveBeenCalledTimes(1);
    const saved = createMany.mock.calls[0]![0];
    expect(saved.data).toHaveLength(2);
    expect(saved.data[0].queryKey).toBe(q.queryKey);
    expect(saved.data[0].source).toBe('gemini-grounding');
    expect(saved.data[0].teamId).toBe('hanwha');
    expect(saved.skipDuplicates).toBe(true);
    // rows.
    expect(data?.rows).toHaveLength(5);
    expect(data?.rows[0]).toEqual({ line: '한화 역전승 — 뉴시스' });
    expect(data?.rows[1]).toEqual({ line: '한화 선발 호투 — 엑스포츠' });
  });

  it('cache MISS + searchNews null(키 없음/검색 실패) → null(폴백)', async () => {
    findMany.mockResolvedValue([]);
    searchNewsMock.mockResolvedValue(null);
    const q = extractNewsQuery('한화 뉴스', 'hanwha');
    expect(await fetchNewsData(q, 'hanwha')).toBeNull();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('cache MISS + searchNews 빈배열 → null(폴백)', async () => {
    findMany.mockResolvedValue([]);
    searchNewsMock.mockResolvedValue([]);
    const q = extractNewsQuery('한화 뉴스', 'hanwha');
    expect(await fetchNewsData(q, 'hanwha')).toBeNull();
  });

  it('getPrisma undefined(DB 없음) → 캐시 skip, searchNews 결과로 rows(저장은 no-op)', async () => {
    getPrismaMock.mockReturnValue(undefined);
    searchNewsMock.mockResolvedValue([
      { title: '오타니 홈런', source: '엠스플' } as NewsItem,
    ]);
    const q = extractNewsQuery('오타니 뉴스', 'hanwha');
    const data = await fetchNewsData(q, 'hanwha');
    expect(searchNewsMock).toHaveBeenCalled();
    expect(data?.rows[0]).toEqual({ line: '오타니 홈런 — 엠스플' });
  });

  it('캐시 findMany throw → MISS 취급(searchNews 진행, throw 안 함)', async () => {
    findMany.mockRejectedValue(new Error('db'));
    searchNewsMock.mockResolvedValue([
      { title: 'A', source: 'src' } as NewsItem,
    ]);
    const q = extractNewsQuery('한화 뉴스', 'hanwha');
    const data = await fetchNewsData(q, 'hanwha');
    expect(data?.rows[0]).toEqual({ line: 'A — src' });
  });

  it('createMany throw(저장 실패) → 응답은 정상 rows(best-effort)', async () => {
    findMany.mockResolvedValue([]);
    createMany.mockRejectedValue(new Error('unique'));
    searchNewsMock.mockResolvedValue([
      { title: 'A', source: 'src' } as NewsItem,
    ]);
    const q = extractNewsQuery('한화 뉴스', 'hanwha');
    const data = await fetchNewsData(q, 'hanwha');
    expect(data?.rows[0]).toEqual({ line: 'A — src' });
  });
});
