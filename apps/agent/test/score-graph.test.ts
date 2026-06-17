/**
 * ScoreGraph 서비스 단위테스트 (P2-W5.5)
 *
 * 순수 함수(pickRelevantGame/gameRowToScoreData/TEAM_DISPLAY_NAME)를 DB 없이 직접 검증한다.
 * fetchScoreData 는 테스트 env(DATABASE_URL='')에서 getPrisma=undefined → null(best-effort)
 * 만 검증한다(실 DB 쿼리는 단위테스트 범위 밖).
 */
import { describe, it, expect } from 'vitest';
import {
  TEAM_DISPLAY_NAME,
  pickRelevantGame,
  gameRowToScoreData,
  fetchScoreData,
  type KboGameRow,
} from '../src/services/score-graph';

function makeRow(over: Partial<KboGameRow>): KboGameRow {
  return {
    gameKey: 'G',
    season: 2026,
    date: new Date('2026-06-10'),
    awayTeam: 'doosan',
    homeTeam: 'hanwha',
    awayScore: 3,
    homeScore: 5,
    gameStatus: 'FINISHED',
    cancellationReason: null,
    ...over,
  };
}

describe('TEAM_DISPLAY_NAME', () => {
  it('팀코드 → 한글/약어 매핑', () => {
    expect(TEAM_DISPLAY_NAME.doosan).toBe('두산');
    expect(TEAM_DISPLAY_NAME.lotte).toBe('롯데');
    expect(TEAM_DISPLAY_NAME.kia).toBe('KIA');
    expect(TEAM_DISPLAY_NAME.heroes).toBe('키움');
    expect(TEAM_DISPLAY_NAME.lg).toBe('LG');
    expect(TEAM_DISPLAY_NAME.ssg).toBe('SSG');
  });
});

describe('pickRelevantGame (순수)', () => {
  it('빈 배열 → null', () => {
    expect(pickRelevantGame([])).toBeNull();
  });

  it('FINISHED 중 date 최신을 선택', () => {
    const rows = [
      makeRow({ gameKey: 'old', date: new Date('2026-06-01'), gameStatus: 'FINISHED' }),
      makeRow({ gameKey: 'new', date: new Date('2026-06-15'), gameStatus: 'FINISHED' }),
      makeRow({ gameKey: 'mid', date: new Date('2026-06-10'), gameStatus: 'FINISHED' }),
    ];
    expect(pickRelevantGame(rows)?.gameKey).toBe('new');
  });

  it('FINISHED 가 더 과거여도 SCHEDULED(미래)보다 우선', () => {
    const rows = [
      makeRow({ gameKey: 'sched', date: new Date('2026-06-20'), gameStatus: 'SCHEDULED' }),
      makeRow({ gameKey: 'fin', date: new Date('2026-06-10'), gameStatus: 'FINISHED' }),
    ];
    expect(pickRelevantGame(rows)?.gameKey).toBe('fin');
  });

  it('FINISHED 없고 SCHEDULED 만 있으면 date 최신 선택', () => {
    const rows = [
      makeRow({ gameKey: 's1', date: new Date('2026-06-18'), gameStatus: 'SCHEDULED' }),
      makeRow({ gameKey: 's2', date: new Date('2026-06-22'), gameStatus: 'SCHEDULED' }),
    ];
    expect(pickRelevantGame(rows)?.gameKey).toBe('s2');
  });
});

describe('gameRowToScoreData (순수)', () => {
  it('팀명 한글 매핑 + 점수 + 상태 라벨(종료)', () => {
    const data = gameRowToScoreData(
      makeRow({
        date: new Date('2026-06-16'),
        homeTeam: 'hanwha',
        awayTeam: 'doosan',
        homeScore: 5,
        awayScore: 3,
        gameStatus: 'FINISHED',
      }),
    );
    expect(data).toEqual({
      home: { name: '한화', score: 5 },
      away: { name: '두산', score: 3 },
      inning: '6/16 경기 종료',
      // P2-W5.4: gameStatus 정규화 값(템플릿 선택 전용, bind 슬롯 아님).
      status: 'FINISHED',
    });
  });

  it('점수 null → 0 으로 폴백', () => {
    const data = gameRowToScoreData(
      makeRow({ homeScore: null, awayScore: null, gameStatus: 'SCHEDULED' }),
    );
    expect(data.home.score).toBe(0);
    expect(data.away.score).toBe(0);
  });

  it('상태 라벨 — SCHEDULED/PLAYING', () => {
    expect(
      gameRowToScoreData(makeRow({ date: new Date('2026-07-01'), gameStatus: 'SCHEDULED' }))
        .inning,
    ).toBe('7/1 경기 예정');
    expect(
      gameRowToScoreData(makeRow({ date: new Date('2026-07-01'), gameStatus: 'PLAYING' }))
        .inning,
    ).toBe('7/1 경기 중');
  });

  it('CANCELLED — 취소 사유 있으면 괄호로 덧붙임', () => {
    expect(
      gameRowToScoreData(
        makeRow({
          date: new Date('2026-06-16'),
          gameStatus: 'CANCELLED',
          cancellationReason: '우천',
        }),
      ).inning,
    ).toBe('6/16 취소(우천)');
  });

  it('CANCELLED — 사유 없으면 "취소"만', () => {
    expect(
      gameRowToScoreData(
        makeRow({ date: new Date('2026-06-16'), gameStatus: 'CANCELLED', cancellationReason: null }),
      ).inning,
    ).toBe('6/16 취소');
  });

  it('status 정규화 — 알려진 상태는 그대로, 미지 상태는 UNKNOWN', () => {
    expect(gameRowToScoreData(makeRow({ gameStatus: 'FINISHED' })).status).toBe('FINISHED');
    expect(gameRowToScoreData(makeRow({ gameStatus: 'PLAYING' })).status).toBe('PLAYING');
    expect(gameRowToScoreData(makeRow({ gameStatus: 'SCHEDULED' })).status).toBe('SCHEDULED');
    expect(gameRowToScoreData(makeRow({ gameStatus: 'CANCELLED' })).status).toBe('CANCELLED');
    expect(gameRowToScoreData(makeRow({ gameStatus: 'WEIRD' })).status).toBe('UNKNOWN');
  });

  it('미지 팀코드 → 코드 그대로, 빈/null → ??', () => {
    const data = gameRowToScoreData(
      makeRow({ homeTeam: 'unknown_team', awayTeam: '' as string }),
    );
    expect(data.home.name).toBe('unknown_team');
    expect(data.away.name).toBe('??');
  });
});

describe('fetchScoreData (best-effort)', () => {
  it("DATABASE_URL='' (getPrisma undefined) → null 반환, throw 안 함", async () => {
    // vitest.config 가 test env DATABASE_URL='' 강제 → getPrisma()=undefined.
    await expect(fetchScoreData('hanwha')).resolves.toBeNull();
    await expect(fetchScoreData(undefined)).resolves.toBeNull();
  });
});
