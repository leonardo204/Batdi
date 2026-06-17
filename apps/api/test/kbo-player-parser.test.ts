/**
 * kbo-player-parser.test.ts — KBO 선수 기본 스탯 파서 단위 테스트 (vitest, P3-W7 7.3a).
 *
 * 합성 fixture HTML(table.tData01, thead+tbody)로 parseHitterBasic / parsePitcherBasic 를 검증한다.
 * 실측 페이지 구조(td 인덱스)를 그대로 반영한 합성 HTML 이며, Playwright/DB 실호출은 하지 않는다.
 *
 * - 타자 thead: 순위|선수명|팀명|AVG|G|PA|AB|R|H|2B|3B|HR|TB|RBI|SAC|SF (td 0~15)
 * - 투수 thead: 순위|선수명|팀명|ERA|G|W|L|SV|HLD|WPCT|IP|H|HR|BB|HBP|SO|R|ER|WHIP (td 0~18)
 */

import { describe, expect, it } from 'vitest';

import {
  parseHitterBasic,
  parsePitcherBasic,
} from '../src/kbo/kbo-parser';
import { PLAYER_TEAM_CODE } from '../src/kbo/kbo.constants';

/** 타자 한 행 생성 (td 16개) */
function hitterRow(cells: string[]): string {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
}

/**
 * 타자 합성 테이블.
 * 실측 예: 1 최원준 KT 0.383 64 307 261 58 100 20 2 5 139 37 3 3
 *   → avg=0.383 G=64 HR=5 RBI=37.
 * + 둘째 행(합성), + 합계행(순위가 "합계" 라 skip 돼야 함).
 */
const HITTER_TABLE =
  '<table class="tData01">' +
  '<thead><tr>' +
  '<th>순위</th><th>선수명</th><th>팀명</th><th>AVG</th><th>G</th><th>PA</th>' +
  '<th>AB</th><th>R</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>TB</th>' +
  '<th>RBI</th><th>SAC</th><th>SF</th>' +
  '</tr></thead>' +
  '<tbody>' +
  hitterRow([
    '1', '최원준', 'KT', '0.383', '64', '307', '261', '58', '100',
    '20', '2', '5', '139', '37', '3', '3',
  ]) +
  hitterRow([
    '2', '노시환', '한화', '0.312', '60', '250', '220', '40', '70',
    '12', '1', '18', '130', '55', '0', '4',
  ]) +
  // 합계행 — 순위 컬럼이 정수가 아니므로 skip 돼야 한다.
  hitterRow([
    '합계', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
  ]) +
  '</tbody></table>';

/** 투수 한 행 생성 (td 19개) */
function pitcherRow(cells: string[]): string {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
}

/**
 * 투수 합성 테이블.
 * 실측 예: 1 올러 KIA 2.66 13 7 5 0 0 0.583 81 1/3 52 5 25 4 86 25 24 0.95
 *   → era=2.66 G=13 SO=86 WHIP=0.95. IP "81 1/3" 은 raw 에만 보존(파싱 안 함).
 */
const PITCHER_TABLE =
  '<table class="tData01">' +
  '<thead><tr>' +
  '<th>순위</th><th>선수명</th><th>팀명</th><th>ERA</th><th>G</th><th>W</th>' +
  '<th>L</th><th>SV</th><th>HLD</th><th>WPCT</th><th>IP</th><th>H</th>' +
  '<th>HR</th><th>BB</th><th>HBP</th><th>SO</th><th>R</th><th>ER</th><th>WHIP</th>' +
  '</tr></thead>' +
  '<tbody>' +
  pitcherRow([
    '1', '올러', 'KIA', '2.66', '13', '7', '5', '0', '0', '0.583',
    '81 1/3', '52', '5', '25', '4', '86', '25', '24', '0.95',
  ]) +
  pitcherRow([
    '2', '폰세', '한화', '1.89', '12', '8', '2', '0', '0', '0.800',
    '76 0/3', '48', '3', '20', '2', '90', '18', '16', '0.89',
  ]) +
  // 합계행 skip 검증.
  pitcherRow([
    '합계', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
  ]) +
  '</tbody></table>';

describe('parseHitterBasic — 타자 기본 스탯', () => {
  const rows = parseHitterBasic(HITTER_TABLE, 2025, 'hanwha');

  it('순위행만 파싱(합계행 skip) → 2명', () => {
    expect(rows).toHaveLength(2);
  });

  it('1행: 최원준 avg=0.383 G=64 HR=5 RBI=37', () => {
    const r = rows[0]!;
    expect(r.name).toBe('최원준');
    expect(r.avg).toBeCloseTo(0.383, 3);
    expect(r.games).toBe(64);
    expect(r.hr).toBe(5);
    expect(r.rbi).toBe(37);
  });

  it('2행: 노시환 HR=18 RBI=55', () => {
    const r = rows[1]!;
    expect(r.name).toBe('노시환');
    expect(r.hr).toBe(18);
    expect(r.rbi).toBe(55);
  });

  it('teamId 인자가 모든 행에 반영된다(td[2] 팀명 무시)', () => {
    for (const r of rows) {
      expect(r.teamId).toBe('hanwha');
      expect(r.season).toBe(2025);
    }
  });

  it('rawData(raw) 에 전체 td 텍스트가 보존된다', () => {
    const r = rows[0]!;
    expect(r.raw).toHaveLength(16);
    expect(r.raw[1]).toBe('최원준');
    expect(r.raw[2]).toBe('KT'); // 원본 팀명도 raw 에 그대로 보존(teamId 와 별개).
    expect(r.raw[12]).toBe('139'); // TB.
  });
});

describe('parsePitcherBasic — 투수 기본 스탯', () => {
  const rows = parsePitcherBasic(PITCHER_TABLE, 2025, 'kia');

  it('순위행만 파싱(합계행 skip) → 2명', () => {
    expect(rows).toHaveLength(2);
  });

  it('1행: 올러 era=2.66 G=13 SO=86 WHIP=0.95', () => {
    const r = rows[0]!;
    expect(r.name).toBe('올러');
    expect(r.era).toBeCloseTo(2.66, 2);
    expect(r.games).toBe(13);
    expect(r.strikeouts).toBe(86);
    expect(r.whip).toBeCloseTo(0.95, 2);
  });

  it('2행: 폰세 era=1.89 WHIP=0.89 SO=90', () => {
    const r = rows[1]!;
    expect(r.name).toBe('폰세');
    expect(r.era).toBeCloseTo(1.89, 2);
    expect(r.whip).toBeCloseTo(0.89, 2);
    expect(r.strikeouts).toBe(90);
  });

  it('IP "81 1/3" 은 raw 에만 보존(파싱하지 않음)', () => {
    const r = rows[0]!;
    expect(r.raw[10]).toBe('81 1/3');
    expect(r.raw).toHaveLength(19);
  });

  it('teamId 인자가 모든 행에 반영된다', () => {
    for (const r of rows) {
      expect(r.teamId).toBe('kia');
      expect(r.season).toBe(2025);
    }
  });
});

describe('숫자 best-effort — NaN→null', () => {
  it('타자: 빈값/대시는 null 로 파싱된다', () => {
    const html =
      '<table class="tData01"><thead><tr><th>순위</th></tr></thead><tbody>' +
      // 순위=3(정수, 파싱 대상), avg="-"(null), G=""(null), HR="-"(null), RBI=""(null).
      '<tr>' +
      ['3', '미상선수', '롯데', '-', '', '0', '0', '0', '0', '0', '0', '-', '0', '', '0', '0']
        .map((c) => `<td>${c}</td>`)
        .join('') +
      '</tr></tbody></table>';
    const rows = parseHitterBasic(html, 2025, 'lotte');
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.avg).toBeNull();
    expect(r.games).toBeNull();
    expect(r.hr).toBeNull();
    expect(r.rbi).toBeNull();
  });

  it('투수: 빈값/대시는 null 로 파싱된다', () => {
    const html =
      '<table class="tData01"><thead><tr><th>순위</th></tr></thead><tbody>' +
      '<tr>' +
      ['5', '미상투수', '두산', '-', '', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '-', '0', '0', '']
        .map((c) => `<td>${c}</td>`)
        .join('') +
      '</tr></tbody></table>';
    const rows = parsePitcherBasic(html, 2025, 'doosan');
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.era).toBeNull();
    expect(r.games).toBeNull();
    expect(r.strikeouts).toBeNull();
    expect(r.whip).toBeNull();
  });
});

describe('PLAYER_TEAM_CODE — 우선 4팀 코드맵', () => {
  it('한화·두산·KIA·롯데 → HH·OB·HT·LT', () => {
    expect(PLAYER_TEAM_CODE.hanwha).toBe('HH');
    expect(PLAYER_TEAM_CODE.doosan).toBe('OB');
    expect(PLAYER_TEAM_CODE.kia).toBe('HT');
    expect(PLAYER_TEAM_CODE.lotte).toBe('LT');
  });

  it('우선 4팀만 정의된다(키 4개)', () => {
    expect(Object.keys(PLAYER_TEAM_CODE).sort()).toEqual(
      ['doosan', 'hanwha', 'kia', 'lotte'],
    );
  });
});
