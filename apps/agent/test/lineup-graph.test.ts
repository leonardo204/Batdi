/**
 * LineupGraph 서비스 단위테스트 (ADR-052 — lineup intent 라인업/타순)
 *
 * 순수 포맷 함수(formatLineupLine)는 DB 없이 직접 검증한다. fetchLineupData 는 라인업 테이블
 * 부재라 **항상 null(정상 경로)** 임을 검증한다(getPrisma 모킹). schedule-graph.test.ts 평행.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getPrismaMock = vi.fn();

vi.mock('../src/utils/prisma', () => ({
  getPrisma: () => getPrismaMock(),
}));

import {
  formatLineupLine,
  fetchLineupData,
  type LineupSlot,
} from '../src/services/lineup-graph';

function makeSlot(over: Partial<LineupSlot> = {}): LineupSlot {
  return { order: 1, position: '중', playerName: '홍길동', ...over };
}

describe('formatLineupLine (순수)', () => {
  it('N번 (포지션) 선수명 포맷', () => {
    expect(formatLineupLine(makeSlot())).toBe('1번 (중) 홍길동');
  });

  it('포지션 없으면 괄호 생략', () => {
    expect(formatLineupLine(makeSlot({ position: null }))).toBe('1번 홍길동');
  });

  it('선수명 없으면 미정 폴백', () => {
    expect(formatLineupLine(makeSlot({ playerName: null }))).toBe(
      '1번 (중) 미정',
    );
  });
});

describe('fetchLineupData (null 정상 경로)', () => {
  beforeEach(() => {
    getPrismaMock.mockReset();
  });

  it('getPrisma undefined(DB 없음) → null', async () => {
    getPrismaMock.mockReturnValue(undefined);
    expect(await fetchLineupData('hanwha')).toBeNull();
  });

  it('getPrisma 있어도 라인업 테이블 부재 → null(정상 경로)', async () => {
    getPrismaMock.mockReturnValue({});
    expect(await fetchLineupData('lotte')).toBeNull();
  });

  it('teamId 미지정도 null(throw 안 함)', async () => {
    getPrismaMock.mockReturnValue({});
    expect(await fetchLineupData(undefined)).toBeNull();
  });
});
