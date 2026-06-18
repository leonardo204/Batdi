/**
 * ScheduleGraph 서비스 단위테스트 (ADR-052 — schedule intent 경기 일정)
 *
 * 순수 포맷 함수(formatScheduleLine)는 DB 없이 직접 검증한다. fetchScheduleData 는 getPrisma 를
 * 모킹해 rows→{date,rows:[{line}]}, 빈/null/throw→null, 팀필터, date>=오늘 0시 + 미종료 필터,
 * 5슬롯 패딩을 검증한다. news-graph.test.ts 평행 패턴.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const getPrismaMock = vi.fn();

vi.mock('../src/utils/prisma', () => ({
  getPrisma: () => getPrismaMock(),
}));

import {
  formatScheduleLine,
  fetchScheduleData,
  type KboScheduleRow,
} from '../src/services/schedule-graph';

function makeRow(over: Partial<KboScheduleRow> = {}): KboScheduleRow {
  return {
    // 2026-06-18 = 목요일
    date: new Date(2026, 5, 18),
    homeTeam: 'hanwha',
    awayTeam: 'doosan',
    gameTime: '18:30',
    stadium: '대전',
    ...over,
  };
}

describe('formatScheduleLine (순수)', () => {
  it('M/D(요일) 홈 vs 원정 · 구장/시각 포맷', () => {
    expect(formatScheduleLine(makeRow())).toBe(
      '6/18(목) 한화 vs 두산 · 대전/18:30',
    );
  });

  it('팀 코드 → 한글명 매핑(미지 코드는 코드 그대로)', () => {
    expect(formatScheduleLine(makeRow({ homeTeam: 'lotte', awayTeam: 'kia' })))
      .toContain('롯데 vs KIA');
  });

  it('구장/시각 모두 없으면 꼬리표 생략', () => {
    expect(
      formatScheduleLine(makeRow({ stadium: null, gameTime: null })),
    ).toBe('6/18(목) 한화 vs 두산');
  });

  it('구장만 있으면 구장만, 시각만 있으면 시각만', () => {
    expect(formatScheduleLine(makeRow({ gameTime: null }))).toBe(
      '6/18(목) 한화 vs 두산 · 대전',
    );
    expect(formatScheduleLine(makeRow({ stadium: null }))).toBe(
      '6/18(목) 한화 vs 두산 · 18:30',
    );
  });
});

describe('fetchScheduleData (getPrisma 모킹)', () => {
  beforeEach(() => {
    findMany.mockReset();
    getPrismaMock.mockReset();
    getPrismaMock.mockReturnValue({ kboGame: { findMany } });
  });

  it('getPrisma undefined(DB 없음) → null(throw 안 함)', async () => {
    getPrismaMock.mockReturnValue(undefined);
    expect(await fetchScheduleData('hanwha')).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rows → {date, rows:[{line}]} 변환 + 5슬롯 패딩', async () => {
    findMany.mockResolvedValue([
      makeRow({ stadium: '대전', gameTime: '18:30' }),
      makeRow({
        date: new Date(2026, 5, 19),
        homeTeam: 'lotte',
        awayTeam: 'kia',
        stadium: '사직',
        gameTime: '14:00',
      }),
    ]);
    const data = await fetchScheduleData('hanwha');
    // schedule_compact 5슬롯(rows.0..rows.4) 전부 바인딩되도록 빈 줄로 패딩 → 5건.
    expect(data?.rows).toHaveLength(5);
    expect(data?.rows[0]).toEqual({ line: '6/18(목) 한화 vs 두산 · 대전/18:30' });
    expect(data?.rows[1]).toEqual({ line: '6/19(금) 롯데 vs KIA · 사직/14:00' });
    // 패딩 줄은 공백.
    expect(data?.rows[2]).toEqual({ line: ' ' });
    // date 헤더 캡션 존재.
    expect(typeof data?.date).toBe('string');
    expect(data?.date).toContain('기준');
  });

  it('빈 결과 → null', async () => {
    findMany.mockResolvedValue([]);
    expect(await fetchScheduleData('hanwha')).toBeNull();
  });

  it('쿼리 throw → null(best-effort)', async () => {
    findMany.mockRejectedValue(new Error('db'));
    expect(await fetchScheduleData('hanwha')).toBeNull();
  });

  it('teamId 있으면 홈/원정 OR + date>=오늘0시 + 미종료(SCHEDULED/PLAYING) + asc + take 5', async () => {
    findMany.mockResolvedValue([makeRow()]);
    await fetchScheduleData('lotte');
    const arg = findMany.mock.calls[0]![0];
    expect(arg.where.OR).toEqual([{ homeTeam: 'lotte' }, { awayTeam: 'lotte' }]);
    // date >= 오늘 0시
    expect(arg.where.date.gte).toBeInstanceOf(Date);
    const gte = arg.where.date.gte as Date;
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
    // 미종료 필터
    expect(arg.where.gameStatus).toEqual({ in: ['SCHEDULED', 'PLAYING'] });
    expect(arg.orderBy).toEqual({ date: 'asc' });
    expect(arg.take).toBe(5);
  });

  it('teamId 미지정 → 팀 필터 없음(전체 경기)', async () => {
    findMany.mockResolvedValue([makeRow()]);
    await fetchScheduleData(undefined);
    const arg = findMany.mock.calls[0]![0];
    expect(arg.where.OR).toBeUndefined();
    expect(arg.where.date.gte).toBeInstanceOf(Date);
    expect(arg.where.gameStatus).toEqual({ in: ['SCHEDULED', 'PLAYING'] });
  });
});
