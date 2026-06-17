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
  detectStatKind,
  formatBattingLine,
  formatPitchingLine,
  fetchPlayerLeaderboard,
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

// ─── P3-W7 7.3b: 선수 스탯 리더보드 ───

describe('detectStatKind (순수)', () => {
  it('투수 키워드(방어율/era/탈삼진/세이브/whip/fip/투수) → pitching', () => {
    expect(detectStatKind('방어율어때')).toBe('pitching');
    expect(detectStatKind('era알려줘')).toBe('pitching');
    expect(detectStatKind('평균자책점')).toBe('pitching');
    expect(detectStatKind('탈삼진순위')).toBe('pitching');
    expect(detectStatKind('whip어때')).toBe('pitching');
    expect(detectStatKind('fip')).toBe('pitching');
    expect(detectStatKind('투수성적')).toBe('pitching');
  });

  it('타자 질의 → batting', () => {
    expect(detectStatKind('타율어때')).toBe('batting');
    expect(detectStatKind('홈런왕누구')).toBe('batting');
    expect(detectStatKind('타점순위')).toBe('batting');
  });

  it('순위(standings) 등 미지정 → batting(기본)', () => {
    expect(detectStatKind('순위')).toBe('batting');
    expect(detectStatKind('')).toBe('batting');
  });
});

describe('formatBattingLine (순수)', () => {
  it('rank + name + avg(3자리) + 홈런 + 타점 포맷', () => {
    expect(formatBattingLine(1, '레이예스', 0.36, 10, 49)).toBe(
      '1  레이예스  0.360  10홈런  49타점',
    );
  });

  it('avg 는 toFixed(3) 로 안정화', () => {
    expect(formatBattingLine(2, '김선수', 0.3125, 5, 30)).toBe(
      '2  김선수  0.313  5홈런  30타점',
    );
  });
});

describe('formatPitchingLine (순수)', () => {
  it('rank + name + era(2자리) ERA + K 포맷', () => {
    expect(formatPitchingLine(1, '류현진', 2.84, 56)).toBe(
      '1  류현진  2.84 ERA  56K',
    );
  });

  it('era 는 toFixed(2) 로 안정화 (whip 인자는 줄 미표시)', () => {
    expect(formatPitchingLine(3, '문동주', 3.5, 120, 1.21)).toBe(
      '3  문동주  3.50 ERA  120K',
    );
  });
});

describe('fetchPlayerLeaderboard (best-effort)', () => {
  it("DATABASE_URL='' (getPrisma undefined) → null, throw 안 함 (batting)", async () => {
    await expect(fetchPlayerLeaderboard('hanwha', 'batting')).resolves.toBeNull();
  });

  it("DATABASE_URL='' → null (pitching)", async () => {
    await expect(fetchPlayerLeaderboard('lotte', 'pitching')).resolves.toBeNull();
  });

  it('teamId 없음 → null (DB 조회 전 가드)', async () => {
    await expect(fetchPlayerLeaderboard(undefined, 'batting')).resolves.toBeNull();
    await expect(fetchPlayerLeaderboard('', 'batting')).resolves.toBeNull();
  });
});
