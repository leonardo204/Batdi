/**
 * StatsGraph 서비스 단위테스트 (stats intent — 팀 순위 standings)
 *
 * 순수 함수(formatStandingsLine)를 DB 없이 직접 검증한다.
 * fetchStandings 는 테스트 env(DATABASE_URL='')에서 getPrisma=undefined → null(best-effort)
 * 만 검증한다(실 DB 쿼리는 단위테스트 범위 밖).
 */
import { describe, it, expect } from 'vitest';
import {
  formatStandingsLine,
  fetchStandings,
  type TeamSeasonRecordRow,
} from '../src/services/stats-graph';

function makeRec(over: Partial<TeamSeasonRecordRow>): TeamSeasonRecordRow {
  return {
    season: 2026,
    team: 'lg',
    teamRank: 1,
    wins: 41,
    losses: 24,
    draws: 0,
    winRate: 0.631,
    ...over,
  };
}

describe('formatStandingsLine (순수)', () => {
  it('한글팀명 + 승패무 + winRate 3자리 포맷', () => {
    const line = formatStandingsLine(
      makeRec({ team: 'lg', teamRank: 1, wins: 41, losses: 24, draws: 0, winRate: 0.631 }),
    );
    expect(line).toBe('1  LG  41승24패0무  0.631');
  });

  it('팀코드 → 한글 매핑(롯데/두산)', () => {
    expect(
      formatStandingsLine(makeRec({ team: 'lotte', teamRank: 5, wins: 30, losses: 30, draws: 2, winRate: 0.5 })),
    ).toBe('5  롯데  30승30패2무  0.500');
    expect(
      formatStandingsLine(makeRec({ team: 'doosan', teamRank: 3, wins: 35, losses: 28, draws: 1, winRate: 0.5556 })),
    ).toBe('3  두산  35승28패1무  0.556');
  });

  it('winRate 는 항상 소수 3자리(toFixed(3))', () => {
    expect(formatStandingsLine(makeRec({ winRate: 0.5 }))).toContain('0.500');
    expect(formatStandingsLine(makeRec({ winRate: 0.66666 }))).toContain('0.667');
    expect(formatStandingsLine(makeRec({ winRate: 1 }))).toContain('1.000');
  });

  it('미지 팀코드 → 코드 그대로 노출', () => {
    expect(
      formatStandingsLine(makeRec({ team: 'unknown_team', teamRank: 10 })),
    ).toContain('unknown_team');
  });
});

describe('fetchStandings (best-effort)', () => {
  it("DATABASE_URL='' (getPrisma undefined) → null 반환, throw 안 함", async () => {
    // vitest.config 가 test env DATABASE_URL='' 강제 → getPrisma()=undefined.
    await expect(fetchStandings()).resolves.toBeNull();
  });
});
