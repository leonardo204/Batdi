/**
 * LineupGraph 서비스 단위테스트 (ADR-056 — lineup intent 선발 매치업 실데이터)
 *
 * 순수 조립 함수(buildLineupRows)는 DB 없이 직접 검증한다. fetchLineupData 는 getPrisma 를
 * 모킹해 game_lineups 행 → LineupData, 빈/null/throw/DB없음/teamId없음 → null 을 검증한다.
 * schedule-graph.test.ts 평행.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirst = vi.fn();
const getPrismaMock = vi.fn();

vi.mock('../src/utils/prisma', () => ({
  getPrisma: () => getPrismaMock(),
}));

import {
  buildLineupRows,
  fetchLineupData,
  type GameLineupRecord,
} from '../src/services/lineup-graph';

function makeRec(over: Partial<GameLineupRecord> = {}): GameLineupRecord {
  return {
    gameDate: new Date('2026-06-18'),
    homeTeamId: 'doosan',
    awayTeamId: 'kt',
    homeTeamName: '두산',
    awayTeamName: 'KT',
    homeStarter: '최민석',
    awayStarter: '소형준',
    stadium: '잠실',
    gameTime: '18:30',
    status: '경기예정',
    ...over,
  };
}

describe('buildLineupRows (순수)', () => {
  it('우리 팀=home(두산) 관점: 우리/상대 선발 + 구장/시각 + 상태, 9슬롯 패딩', () => {
    const data = buildLineupRows(makeRec(), 'doosan');
    expect(data.team).toBe('두산');
    expect(data.rows).toHaveLength(9);
    expect(data.rows[0]!.line).toBe('우리 선발: 두산 최민석');
    expect(data.rows[1]!.line).toBe('상대: KT 소형준');
    expect(data.rows[2]!.line).toBe('구장: 잠실 18:30');
    expect(data.rows[3]!.line).toBe('상태: 경기예정');
    // 4~8 공백 패딩
    expect(data.rows.slice(4).every((r) => r.line === ' ')).toBe(true);
  });

  it('우리 팀=away(KT) 관점: away 선발이 우리 선발', () => {
    const data = buildLineupRows(makeRec(), 'kt');
    expect(data.team).toBe('KT');
    expect(data.rows[0]!.line).toBe('우리 선발: KT 소형준');
    expect(data.rows[1]!.line).toBe('상대: 두산 최민석');
  });

  it('선발 미발표(null) → 미정, 구장/시각 없으면 줄 생략', () => {
    const data = buildLineupRows(
      makeRec({ homeStarter: null, awayStarter: null, stadium: null, gameTime: null }),
      'doosan',
    );
    expect(data.rows[0]!.line).toBe('우리 선발: 두산 미정');
    expect(data.rows[1]!.line).toBe('상대: KT 미정');
    // 구장/시각 줄 없이 곧장 상태
    expect(data.rows[2]!.line).toBe('상태: 경기예정');
  });

  it('미지원 팀(teamId null)도 크롤 한글명으로 표시', () => {
    const data = buildLineupRows(
      makeRec({
        homeTeamId: null,
        homeTeamName: '키움',
        awayTeamId: null,
        awayTeamName: '삼성',
      }),
      'doosan', // 어느 쪽과도 매칭 안 됨 → home 관점 폴백
    );
    expect(data.team).toBe('키움');
    expect(data.rows[0]!.line).toBe('우리 선발: 키움 최민석');
    expect(data.rows[1]!.line).toBe('상대: 삼성 소형준');
  });
});

describe('fetchLineupData (실데이터 경로)', () => {
  beforeEach(() => {
    getPrismaMock.mockReset();
    findFirst.mockReset();
  });

  it('teamId 없음 → null(쿼리 안 함)', async () => {
    getPrismaMock.mockReturnValue({ gameLineup: { findFirst } });
    expect(await fetchLineupData(undefined)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('getPrisma undefined(DB 없음) → null', async () => {
    getPrismaMock.mockReturnValue(undefined);
    expect(await fetchLineupData('doosan')).toBeNull();
  });

  it('행 있음 → LineupData(우리/상대 선발), home OR away 필터 + asc take 1', async () => {
    findFirst.mockResolvedValue(makeRec());
    getPrismaMock.mockReturnValue({ gameLineup: { findFirst } });

    const data = await fetchLineupData('doosan');
    expect(data).not.toBeNull();
    expect(data!.team).toBe('두산');
    expect(data!.rows[0]!.line).toBe('우리 선발: 두산 최민석');

    const arg = findFirst.mock.calls[0]![0];
    expect(arg.where.OR).toEqual([
      { homeTeamId: 'doosan' },
      { awayTeamId: 'doosan' },
    ]);
    expect(arg.where.gameDate.gte).toBeInstanceOf(Date);
    expect(arg.orderBy).toEqual({ gameDate: 'asc' });
  });

  it('행 없음(null) → null(폴백)', async () => {
    findFirst.mockResolvedValue(null);
    getPrismaMock.mockReturnValue({ gameLineup: { findFirst } });
    expect(await fetchLineupData('lotte')).toBeNull();
  });

  it('쿼리 throw → null(best-effort, throw 안 함)', async () => {
    findFirst.mockRejectedValue(new Error('db'));
    getPrismaMock.mockReturnValue({ gameLineup: { findFirst } });
    expect(await fetchLineupData('hanwha')).toBeNull();
  });
});
