/**
 * kbo-parser.test.ts — KBO 파서 + 매핑 순수 함수 단위 테스트 (vitest).
 *
 * 픽스처 HTML(apps/api/test/fixtures/kbo/*.html)을 로드해 파서를 검증한다.
 * Playwright 실사이트 호출은 하지 않는다(파서만 테스트, 네트워크 없음).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  parseGameSchedule,
  parseTeamSeasonRecord,
} from '../src/kbo/kbo-parser';
import {
  cancellationReasonFromString,
  getSeriesType,
  toTeamCode,
} from '../src/kbo/kbo-teams';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'kbo');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.html`), 'utf-8');
}

describe('parseGameSchedule — 맨몸 tbody 회귀 (스크래퍼 실입력 형태)', () => {
  // ⚠️ 스크래퍼는 `#tblScheduleList > tbody` outerHTML(= 맨몸 <tbody>, <table> 래퍼 없음)을
  //   넘긴다. cheerio v1(parse5)은 table 컨텍스트 없는 <tbody>/<tr> 를 foster-parenting 으로
  //   폐기해 과거 0건 버그가 났다(픽스처는 full <table> 라 회귀 미검출). loadRows 의 래핑으로
  //   맨몸 tbody 도 파싱돼야 한다. (실서비스 라이브 크롤 0건 → 137건 수정의 회귀 가드)
  const bareTbody =
    '<tbody>' +
    '<tr><td class="day" rowspan="1">05.01(수)</td><td class="time"><b>18:30</b></td>' +
    '<td class="play"><span>SSG</span><em><span class="win">8</span><span>vs</span>' +
    '<span class="lose">7</span></em><span>한화</span></td>' +
    '<td class="relay"><a>리뷰</a></td><td><a>하이라이트</a></td>' +
    '<td>SPO</td><td></td><td>한밭</td><td>-</td></tr>' +
    '</tbody>';

  it('맨몸 tbody 도 행을 파싱한다(0건 버그 회귀 방지)', () => {
    const rows = parseGameSchedule(bareTbody, 2024, 'REGULAR_SEASON');
    expect(rows.length).toBe(1);
    expect(rows[0]!.awayTeam).toBe('ssg');
    expect(rows[0]!.homeTeam).toBe('hanwha');
    expect(rows[0]!.awayScore).toBe(8);
    expect(rows[0]!.homeScore).toBe(7);
    expect(rows[0]!.gameStatus).toBe('FINISHED');
  });
});

describe('parseGameSchedule — finished-games', () => {
  const rows = parseGameSchedule(loadFixture('finished-games'), 2025, 'REGULAR_SEASON');

  it('5경기를 파싱한다', () => {
    expect(rows).toHaveLength(5);
  });

  it('첫 경기: SSG(away) 2 vs LG(home) 1, FINISHED, 2025-05-02', () => {
    const g = rows[0]!;
    expect(g.awayTeam).toBe('ssg');
    expect(g.homeTeam).toBe('lg');
    expect(g.awayScore).toBe(2);
    expect(g.homeScore).toBe(1);
    expect(g.gameStatus).toBe('FINISHED');
    expect(g.date).toBe('2025-05-02');
    expect(g.gameTime).toBe('18:30');
    expect(g.stadium).toBe('잠실');
    expect(g.relay).toBe('SPO-T');
    expect(g.cancellationReason).toBeNull();
    expect(g.seriesType).toBe('REGULAR_SEASON');
    expect(g.season).toBe(2025);
    expect(g.gameKey).toBe('20250502-ssg-lg-1');
  });

  it('둘째 경기: NC(away) 3 vs 롯데(home) 4', () => {
    const g = rows[1]!;
    expect(g.awayTeam).toBe('nc');
    expect(g.homeTeam).toBe('lotte');
    expect(g.awayScore).toBe(3);
    expect(g.homeScore).toBe(4);
    expect(g.gameStatus).toBe('FINISHED');
    expect(g.stadium).toBe('사직');
  });

  it('모든 경기 날짜가 carry-forward(rowspan)로 2025-05-02 이다', () => {
    for (const g of rows) {
      expect(g.date).toBe('2025-05-02');
      expect(g.gameStatus).toBe('FINISHED');
    }
  });
});

describe('parseGameSchedule — scheduled-games', () => {
  const rows = parseGameSchedule(loadFixture('scheduled-games'), 2025, 'POSTSEASON');

  it('예정 경기는 점수가 null, 상태 SCHEDULED', () => {
    // 첫 행은 점수가 있어(3 vs 7) FINISHED, 나머지 두 행은 예정.
    const scheduled = rows.filter((g) => g.gameStatus === 'SCHEDULED');
    expect(scheduled.length).toBeGreaterThanOrEqual(1);
    for (const g of scheduled) {
      expect(g.awayScore).toBeNull();
      expect(g.homeScore).toBeNull();
      expect(g.cancellationReason).toBeNull();
    }
  });

  it('각기 다른 날짜를 가진다(rowspan=1)', () => {
    const dates = rows.map((g) => g.date);
    expect(dates).toContain('2025-10-29');
    expect(dates).toContain('2025-10-30');
    expect(dates).toContain('2025-10-31');
  });
});

describe('parseGameSchedule — cancelled-games', () => {
  const rows = parseGameSchedule(loadFixture('cancelled-games'), 2025, 'REGULAR_SEASON');

  it('취소 경기는 CANCELLED + cancellationReason 채워짐', () => {
    const cancelled = rows.filter((g) => g.gameStatus === 'CANCELLED');
    expect(cancelled.length).toBeGreaterThanOrEqual(1);
    for (const g of cancelled) {
      expect(g.cancellationReason).not.toBeNull();
    }
    // 그라운드사정 / 우천취소 매핑 확인.
    const reasons = cancelled.map((g) => g.cancellationReason);
    expect(reasons).toContain('GROUND_CONDITION');
    expect(reasons).toContain('RAIN');
  });

  it('정상 경기(비고 "-")는 취소가 아니다', () => {
    const finished = rows.filter((g) => g.gameStatus === 'FINISHED');
    expect(finished.length).toBeGreaterThanOrEqual(1);
    for (const g of finished) {
      expect(g.cancellationReason).toBeNull();
    }
  });
});

describe('parseGameSchedule — double-header-games', () => {
  const rows = parseGameSchedule(loadFixture('double-header-games'), 2025, 'REGULAR_SEASON');

  it('같은 대진 더블헤더 gameKey count 가 1,2 로 증가한다', () => {
    // NC vs 두산 더블헤더 (NCOB1, NCOB2)
    const ncDoosan = rows.filter(
      (g) => g.awayTeam === 'nc' && g.homeTeam === 'doosan',
    );
    expect(ncDoosan).toHaveLength(2);
    const keys = ncDoosan.map((g) => g.gameKey).sort();
    expect(keys[0]).toBe('20250511-nc-doosan-1');
    expect(keys[1]).toBe('20250511-nc-doosan-2');
  });

  it('동점 경기(same)도 점수가 파싱된다 (롯데 1 vs KT 1)', () => {
    const tie = rows.filter(
      (g) => g.awayTeam === 'lotte' && g.homeTeam === 'kt' && g.gameKey.endsWith('-2'),
    );
    expect(tie).toHaveLength(1);
    expect(tie[0]!.awayScore).toBe(1);
    expect(tie[0]!.homeScore).toBe(1);
  });

  it('relay 의 <br> 은 콤마로 치환된다 (멀티 중계)', () => {
    const multi = rows.find((g) => g.relay?.includes(','));
    expect(multi).toBeDefined();
    // 예: "SPO-2T,MS-T"
    expect(multi!.relay).toMatch(/,/);
  });
});

describe('parseGameSchedule — no-games / travel-day', () => {
  it('no-games: 빈 배열', () => {
    const rows = parseGameSchedule(loadFixture('no-games'), 2025, 'REGULAR_SEASON');
    expect(rows).toHaveLength(0);
  });

  it('travel-day: 이동일 행은 skip, 실제 경기만 파싱', () => {
    const rows = parseGameSchedule(loadFixture('travel-day'), 2025, 'POSTSEASON');
    // 한 경기(한화 vs LG)만 있고 이동일 행은 제외.
    expect(rows).toHaveLength(1);
    const g = rows[0]!;
    expect(g.awayTeam).toBe('hanwha');
    expect(g.homeTeam).toBe('lg');
    expect(g.date).toBe('2025-10-27');
  });
});

describe('parseTeamSeasonRecord — team-rank', () => {
  const rows = parseTeamSeasonRecord(loadFixture('team-rank'), 2025);

  it('10팀을 파싱한다', () => {
    expect(rows).toHaveLength(10);
  });

  it('rank 1~10 순서대로 채워진다', () => {
    const ranks = rows.map((r) => r.teamRank);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('1위 LG: 85승 56패 3무, 승률 0.603, 게임차 0', () => {
    const lg = rows[0]!;
    expect(lg.team).toBe('lg');
    expect(lg.gamesPlayed).toBe(144);
    expect(lg.wins).toBe(85);
    expect(lg.losses).toBe(56);
    expect(lg.draws).toBe(3);
    expect(lg.winRate).toBeCloseTo(0.603, 3);
    expect(lg.gamesBehind).toBe(0);
    expect(lg.recent10Games).toBe('4승0무6패');
    expect(lg.streak).toBe('3패');
  });

  it('2위 한화: 게임차 1.5 (float)', () => {
    const hanwha = rows[1]!;
    expect(hanwha.team).toBe('hanwha');
    expect(hanwha.gamesBehind).toBeCloseTo(1.5, 1);
  });

  it('필드 타입 확인', () => {
    for (const r of rows) {
      expect(typeof r.teamRank).toBe('number');
      expect(typeof r.winRate).toBe('number');
      expect(typeof r.gamesBehind).toBe('number');
      expect(typeof r.recent10Games).toBe('string');
      expect(typeof r.streak).toBe('string');
    }
  });
});

describe('순수 함수: toTeamCode', () => {
  it('한국어/영문 팀명을 코드로 변환', () => {
    expect(toTeamCode('두산')).toBe('doosan');
    expect(toTeamCode('삼성')).toBe('samsung');
    expect(toTeamCode('롯데')).toBe('lotte');
    expect(toTeamCode('한화')).toBe('hanwha');
    expect(toTeamCode('LG')).toBe('lg');
    expect(toTeamCode('KIA')).toBe('kia');
    expect(toTeamCode('키움')).toBe('heroes');
    expect(toTeamCode('NC')).toBe('nc');
    expect(toTeamCode('KT')).toBe('kt');
    expect(toTeamCode('SSG')).toBe('ssg');
  });

  it('공백 trim 후 매칭', () => {
    expect(toTeamCode('  롯데  ')).toBe('lotte');
  });

  it('미매칭은 unknown', () => {
    expect(toTeamCode('우주최강')).toBe('unknown');
    expect(toTeamCode('')).toBe('unknown');
  });
});

describe('순수 함수: getSeriesType', () => {
  it('시리즈 드롭다운 code 매핑', () => {
    expect(getSeriesType('PRESEASON').code).toBe('1');
    expect(getSeriesType('REGULAR_SEASON').code).toBe('0,9,6');
    expect(getSeriesType('POSTSEASON').code).toBe('3,4,5,7');
  });
});

describe('순수 함수: cancellationReasonFromString', () => {
  it('키워드 매핑', () => {
    expect(cancellationReasonFromString('그라운드사정')).toBe('GROUND_CONDITION');
    expect(cancellationReasonFromString('우천취소')).toBe('RAIN');
    expect(cancellationReasonFromString('폭염')).toBe('HEATWAVE');
    expect(cancellationReasonFromString('미세먼지')).toBe('FINE_DUST');
    expect(cancellationReasonFromString('강풍')).toBe('STRONG_WIND');
    expect(cancellationReasonFromString('황사')).toBe('YELLOW_DUST');
  });

  it('"-"/빈문자열은 null(취소 아님)', () => {
    expect(cancellationReasonFromString('-')).toBeNull();
    expect(cancellationReasonFromString('')).toBeNull();
    expect(cancellationReasonFromString('  ')).toBeNull();
  });

  it('비어있지 않으나 미매칭이면 ETC', () => {
    expect(cancellationReasonFromString('코로나')).toBe('ETC');
  });
});
