/**
 * kbo-lineup-parser.test.ts — GameCenter 라인업 파서 단위 테스트 (ADR-056, vitest).
 *
 * 픽스처(gamecenter-lineups.html, 2026-06-18 실측 구조)를 로드해 parseLineups 의
 * 속성/텍스트 파싱·팀매핑·home/away 순서·선발투수 추출("선" 접두 제거)·미발표 null·
 * g_id 누락 skip 을 검증한다. Playwright 실호출 없음(파서 순수 함수).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  extractStarterName,
  parseLineups,
  teamNameToId,
  type GameLineupRow,
} from '../src/kbo/kbo-parser';

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'kbo',
);

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.html`), 'utf-8');
}

function byKey(rows: GameLineupRow[], key: string): GameLineupRow {
  const r = rows.find((x) => x.gameKey === key);
  if (!r) {
    throw new Error(`gameKey ${key} not parsed`);
  }
  return r;
}

describe('teamNameToId (순수 매핑)', () => {
  it('지원 팀(두산/KIA/기아/롯데/한화/LG/KT/삼성/NC/SSG/키움) → teamId', () => {
    expect(teamNameToId('두산')).toBe('doosan');
    expect(teamNameToId('KIA')).toBe('kia');
    expect(teamNameToId('기아')).toBe('kia');
    expect(teamNameToId('롯데')).toBe('lotte');
    expect(teamNameToId('한화')).toBe('hanwha');
    expect(teamNameToId('LG')).toBe('lg');
    expect(teamNameToId('KT')).toBe('kt');
    expect(teamNameToId('삼성')).toBe('samsung');
    expect(teamNameToId('키움')).toBe('heroes');
  });

  it('미지원/빈값 → null', () => {
    expect(teamNameToId('없는팀')).toBeNull();
    expect(teamNameToId('')).toBeNull();
    expect(teamNameToId(null)).toBeNull();
    expect(teamNameToId(undefined)).toBeNull();
  });
});

describe('extractStarterName (순수)', () => {
  it('"선" 접두 + 공백 제거', () => {
    expect(extractStarterName('선소형준 ')).toBe('소형준');
    expect(extractStarterName(' 선  양현종 ')).toBe('양현종');
  });

  it('빈/null → null(미발표)', () => {
    expect(extractStarterName('')).toBeNull();
    expect(extractStarterName('   ')).toBeNull();
    expect(extractStarterName(null)).toBeNull();
    expect(extractStarterName('선')).toBeNull();
  });
});

describe('parseLineups — 픽스처(실측 구조)', () => {
  const html = loadFixture('gamecenter-lineups');
  const rows = parseLineups(html);

  it('g_id 있는 경기만 파싱(누락 1건 skip → 3건)', () => {
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.gameKey !== '')).toBe(true);
  });

  it('속성 파싱 + g_dt→ISO + 구장 + 시각 + 상태', () => {
    const g = byKey(rows, '20260618KTOB0');
    expect(g.gameDate).toBe('2026-06-18');
    expect(g.stadium).toBe('잠실');
    expect(g.gameTime).toBe('18:30');
    expect(g.status).toBe('경기예정');
  });

  it('home/away 한글명 + teamId 매핑 (away-then-home 순)', () => {
    const g = byKey(rows, '20260618KTOB0');
    // g_id KTOB = KT(away) @ OB(home=두산)
    expect(g.awayTeamName).toBe('KT');
    expect(g.homeTeamName).toBe('두산');
    expect(g.awayTeamId).toBe('kt');
    expect(g.homeTeamId).toBe('doosan');
  });

  it('선발투수 home/away 정확 매칭(.team.away/.team.home 직접 읽기)', () => {
    const g = byKey(rows, '20260618KTOB0');
    // away(KT) 선발=소형준, home(두산) 선발=최민석
    expect(g.awayStarter).toBe('소형준');
    expect(g.homeStarter).toBe('최민석');

    const g2 = byKey(rows, '20260618LGHT0');
    expect(g2.awayStarter).toBe('톨허스트'); // LG away
    expect(g2.homeStarter).toBe('양현종'); // KIA home
    expect(g2.awayTeamId).toBe('lg');
    expect(g2.homeTeamId).toBe('kia');
  });

  it('선발 미발표/시각 없음 → null(throw 안 함), 상태 폴백', () => {
    const g = byKey(rows, '20260618SSWO0');
    expect(g.awayStarter).toBeNull();
    expect(g.homeStarter).toBeNull();
    expect(g.gameTime).toBeNull();
    expect(g.status).toBe('경기예정'); // .staus 빈 → 폴백
    // 미지원 팀명(삼성/키움)도 매핑 존재
    expect(g.awayTeamId).toBe('samsung');
    expect(g.homeTeamId).toBe('heroes');
  });
});
