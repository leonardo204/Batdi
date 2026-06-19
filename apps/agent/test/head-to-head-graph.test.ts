/**
 * HeadToHeadGraph 서비스 단위테스트 (ADR-057 — h2h intent 팀 상대전적)
 *
 * 순수 포맷 함수(formatH2HLine)는 DB 없이 직접 검증한다. fetchHeadToHead 는 getPrisma 를
 * 모킹해 rows→{rows:[{line}]}·9슬롯 패딩, 빈/null/throw→null, teamId 없음→null, 쿼리 인자
 * (season/teamId/wins desc/take 9)를 검증한다. news-graph.test.ts 평행 패턴.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const getPrismaMock = vi.fn();

vi.mock('../src/utils/prisma', () => ({
  getPrisma: () => getPrismaMock(),
}));

import {
  formatH2HLine,
  fetchHeadToHead,
  type TeamHeadToHeadRecord,
} from '../src/services/head-to-head-graph';

function makeRec(over: Partial<TeamHeadToHeadRecord> = {}): TeamHeadToHeadRecord {
  return {
    opponentName: 'SSG',
    wins: 8,
    losses: 1,
    draws: 0,
    ...over,
  };
}

describe('formatH2HLine (순수)', () => {
  it('"vs {상대} {W}승{L}패{D}무" 포맷', () => {
    expect(formatH2HLine(makeRec())).toBe('vs SSG 8승1패0무');
  });

  it('opponentName 없으면 "상대" 폴백', () => {
    expect(formatH2HLine(makeRec({ opponentName: null }))).toBe(
      'vs 상대 8승1패0무',
    );
  });
});

describe('fetchHeadToHead (getPrisma 모킹)', () => {
  beforeEach(() => {
    findMany.mockReset();
    getPrismaMock.mockReset();
    getPrismaMock.mockReturnValue({ teamHeadToHead: { findMany } });
  });

  it('teamId 미지정 → null(조회 안 함)', async () => {
    expect(await fetchHeadToHead(undefined)).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('getPrisma undefined(DB 없음) → null(throw 안 함)', async () => {
    getPrismaMock.mockReturnValue(undefined);
    expect(await fetchHeadToHead('lg')).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rows → {rows:[{line}]} 변환(formatH2HLine 적용) + 9슬롯 패딩', async () => {
    findMany.mockResolvedValue([
      makeRec({ opponentName: 'SSG', wins: 8, losses: 1, draws: 0 }),
      makeRec({ opponentName: 'KT', wins: 3, losses: 5, draws: 0 }),
    ]);
    const data = await fetchHeadToHead('lg');
    // h2h_compact 9슬롯(rows.0..rows.8) 전부 바인딩되도록 빈 줄로 패딩 → 9건.
    expect(data?.rows).toHaveLength(9);
    expect(data?.rows[0]).toEqual({ line: 'vs SSG 8승1패0무' });
    expect(data?.rows[1]).toEqual({ line: 'vs KT 3승5패0무' });
    // 패딩 줄은 공백.
    expect(data?.rows[2]).toEqual({ line: ' ' });
  });

  it('빈 결과 → null', async () => {
    findMany.mockResolvedValue([]);
    expect(await fetchHeadToHead('lg')).toBeNull();
  });

  it('쿼리 throw → null(best-effort)', async () => {
    findMany.mockRejectedValue(new Error('db'));
    expect(await fetchHeadToHead('lg')).toBeNull();
  });

  it('현재 시즌 + teamId 필터 + wins desc + take 9 쿼리 인자', async () => {
    findMany.mockResolvedValue([makeRec()]);
    await fetchHeadToHead('hanwha');
    const arg = findMany.mock.calls[0]![0];
    expect(arg.where).toEqual({
      season: new Date().getFullYear(),
      teamId: 'hanwha',
    });
    expect(arg.orderBy).toEqual({ wins: 'desc' });
    expect(arg.take).toBe(9);
  });
});
