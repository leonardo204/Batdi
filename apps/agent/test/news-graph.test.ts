/**
 * NewsGraph 서비스 단위테스트 (P3-W7 7.5 ADR-048 — news intent KBO 뉴스)
 *
 * 순수 포맷 함수(formatNewsLine)는 DB 없이 직접 검증한다. fetchNewsData 는 getPrisma 를
 * 모킹해 rows→{rows:[{line}]}, 빈/null/throw→null, expiresAt 필터 인자 전달을 검증한다.
 * stats-graph.test.ts 평행 패턴.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const getPrismaMock = vi.fn();

vi.mock('../src/utils/prisma', () => ({
  getPrisma: () => getPrismaMock(),
}));

import {
  formatNewsLine,
  fetchNewsData,
  type CacheNewsRow,
} from '../src/services/news-graph';

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
});

describe('fetchNewsData (getPrisma 모킹)', () => {
  beforeEach(() => {
    findMany.mockReset();
    getPrismaMock.mockReset();
    getPrismaMock.mockReturnValue({ cacheNews: { findMany } });
  });

  it('getPrisma undefined(DB 없음) → null(throw 안 함)', async () => {
    getPrismaMock.mockReturnValue(undefined);
    expect(await fetchNewsData('hanwha')).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rows → {rows:[{line}]} 변환(formatNewsLine 적용) + 5슬롯 패딩', async () => {
    findMany.mockResolvedValue([
      makeRow({ summary: 'A 요약', source: 'src1' }),
      makeRow({ summary: 'B 요약', source: 'src2' }),
    ]);
    const data = await fetchNewsData('hanwha');
    // news_compact 5슬롯(rows.0..rows.4) 전부 바인딩되도록 빈 줄로 패딩 → 5건.
    expect(data?.rows).toHaveLength(5);
    expect(data?.rows[0]).toEqual({ line: 'A 요약 — src1' });
    expect(data?.rows[1]).toEqual({ line: 'B 요약 — src2' });
    // 패딩 줄은 공백.
    expect(data?.rows[2]).toEqual({ line: ' ' });
  });

  it('5건 이상이면 패딩 없이 그대로(take 5 상한)', async () => {
    findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, n) =>
        makeRow({ summary: `요약${n}`, source: 'src' }),
      ),
    );
    const data = await fetchNewsData('hanwha');
    expect(data?.rows).toHaveLength(5);
    expect(data?.rows.every((r) => r.line.trim() !== '')).toBe(true);
  });

  it('빈 결과 → null', async () => {
    findMany.mockResolvedValue([]);
    expect(await fetchNewsData('hanwha')).toBeNull();
  });

  it('쿼리 throw → null(best-effort)', async () => {
    findMany.mockRejectedValue(new Error('db'));
    expect(await fetchNewsData('hanwha')).toBeNull();
  });

  it('teamId 있으면 팀 OR null 필터 + expiresAt>now + publishedAt desc + take 5', async () => {
    findMany.mockResolvedValue([makeRow()]);
    await fetchNewsData('lotte');
    const arg = findMany.mock.calls[0]![0];
    expect(arg.where.OR).toEqual([{ teamId: 'lotte' }, { teamId: null }]);
    expect(arg.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(arg.orderBy).toEqual({ publishedAt: 'desc' });
    expect(arg.take).toBe(5);
  });

  it('teamId 미지정 → 일반 뉴스(teamId null)만 필터', async () => {
    findMany.mockResolvedValue([makeRow()]);
    await fetchNewsData(undefined);
    const arg = findMany.mock.calls[0]![0];
    expect(arg.where.OR).toEqual([{ teamId: null }]);
  });
});
