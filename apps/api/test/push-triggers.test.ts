/**
 * push-triggers.test.ts — 푸시 트리거 4종 결정 함수 경계 (P4-W11 — ADR-055, W11 DoD 핵심).
 *
 * 부수효과 없는 순수 함수 4종의 경계 조건을 검증한다(payload vs null).
 */
import { describe, it, expect } from 'vitest';
import {
  gameStartSoonTrigger,
  leadChangeTrigger,
  favoritePlayerActiveTrigger,
  levelUpTrigger,
  GAME_START_LEAD_MINUTES,
} from '../src/push/push-triggers';

const NOW = Date.UTC(2026, 5, 18, 9, 0, 0); // 임의 기준 시각.
const min = (n: number) => n * 60000;

describe('gameStartSoonTrigger', () => {
  it('정확히 30분 전 → payload', () => {
    const game = { startAt: NOW + min(GAME_START_LEAD_MINUTES), matchup: '롯데 vs 두산' };
    const result = gameStartSoonTrigger(game, NOW);
    expect(result).not.toBeNull();
    expect(result?.title).toContain('경기 시작');
    expect(result?.body).toContain('롯데 vs 두산');
  });

  it('윈도우 내(28분 전) → payload', () => {
    const game = { startAt: NOW + min(28), matchup: 'A vs B' };
    expect(gameStartSoonTrigger(game, NOW)).not.toBeNull();
  });

  it('너무 이름(60분 전) → null', () => {
    const game = { startAt: NOW + min(60), matchup: 'A vs B' };
    expect(gameStartSoonTrigger(game, NOW)).toBeNull();
  });

  it('윈도우 지남(10분 전) → null', () => {
    const game = { startAt: NOW + min(10), matchup: 'A vs B' };
    expect(gameStartSoonTrigger(game, NOW)).toBeNull();
  });

  it('이미 시작함(과거) → null', () => {
    const game = { startAt: NOW - min(5), matchup: 'A vs B' };
    expect(gameStartSoonTrigger(game, NOW)).toBeNull();
  });
});

describe('leadChangeTrigger', () => {
  it('역전(home 리드 → away 리드) → payload(역전)', () => {
    const result = leadChangeTrigger({ home: 3, away: 2 }, { home: 3, away: 5 });
    expect(result).not.toBeNull();
    expect(result?.title).toBe('역전!');
  });

  it('역전(away 리드 → home 리드) → payload(역전)', () => {
    const result = leadChangeTrigger({ home: 1, away: 4 }, { home: 5, away: 4 });
    expect(result?.title).toBe('역전!');
  });

  it('동점 발생(home 리드 → 동점) → payload(동점)', () => {
    const result = leadChangeTrigger({ home: 3, away: 1 }, { home: 3, away: 3 });
    expect(result?.title).toBe('동점!');
  });

  it('리드 유지(점수만 증가) → null', () => {
    expect(leadChangeTrigger({ home: 2, away: 1 }, { home: 4, away: 1 })).toBeNull();
  });

  it('동점 유지 → null', () => {
    expect(leadChangeTrigger({ home: 2, away: 2 }, { home: 3, away: 3 })).toBeNull();
  });

  it('첫 리드(동점 → 리드) → null(역전/동점 아님)', () => {
    expect(leadChangeTrigger({ home: 0, away: 0 }, { home: 1, away: 0 })).toBeNull();
  });
});

describe('favoritePlayerActiveTrigger', () => {
  const event = { playerId: 42, playerName: '이대호', kind: '홈런' };

  it('관심 선수 매칭 → payload', () => {
    const result = favoritePlayerActiveTrigger([7, 42, 99], event);
    expect(result).not.toBeNull();
    expect(result?.body).toContain('이대호');
    expect(result?.body).toContain('홈런');
  });

  it('관심 선수 비매칭 → null', () => {
    expect(favoritePlayerActiveTrigger([7, 99], event)).toBeNull();
  });

  it('관심 목록 비어있음 → null', () => {
    expect(favoritePlayerActiveTrigger([], event)).toBeNull();
  });
});

describe('levelUpTrigger', () => {
  it('레벨 상승 → payload', () => {
    const result = levelUpTrigger(1, 2, '내야석');
    expect(result).not.toBeNull();
    expect(result?.body).toContain('Lv2');
    expect(result?.body).toContain('내야석');
  });

  it('레벨 동일 → null', () => {
    expect(levelUpTrigger(3, 3, '응원단석')).toBeNull();
  });

  it('레벨 하락 → null', () => {
    expect(levelUpTrigger(4, 3, '응원단석')).toBeNull();
  });
});
