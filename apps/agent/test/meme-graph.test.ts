/**
 * MemeGraph 서비스 단위테스트 (P3-W8 8.2 — meme intent 팀별 밈)
 *
 * 순수 헬퍼(pickRandom)와 best-effort fetchRandomMeme 을 DB 없이 검증한다.
 * 테스트 env 는 DATABASE_URL='' → getPrisma=undefined → STATIC_MEMES 폴백 경로만 탄다.
 * 랜덤이라 정확한 값은 단언할 수 없으므로 "후보 집합에 속함"으로 단언한다.
 */
import { describe, it, expect } from 'vitest';
import {
  pickRandom,
  fetchRandomMeme,
  STATIC_MEMES,
} from '../src/services/meme-graph';

describe('pickRandom (순수)', () => {
  it('비어있지 않은 배열 → 그 원소 중 하나 반환', () => {
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 20; i++) {
      const picked = pickRandom(arr);
      expect(picked).toBeDefined();
      expect(arr).toContain(picked);
    }
  });

  it('단일 원소 배열 → 그 원소', () => {
    expect(pickRandom(['only'])).toBe('only');
  });

  it('빈 배열 → undefined (안전 처리)', () => {
    expect(pickRandom([])).toBeUndefined();
  });
});

describe('STATIC_MEMES (폴백 세트)', () => {
  it('4팀 + default 키 모두 비어있지 않다', () => {
    for (const key of ['hanwha', 'doosan', 'kia', 'lotte', 'default']) {
      expect(STATIC_MEMES[key]).toBeDefined();
      expect(STATIC_MEMES[key].length).toBeGreaterThanOrEqual(2);
      for (const m of STATIC_MEMES[key]) {
        expect(typeof m).toBe('string');
        expect(m.trim()).not.toBe('');
      }
    }
  });
});

describe('fetchRandomMeme (best-effort, DATABASE_URL=\'\')', () => {
  it('DB 없음(getPrisma undefined) → STATIC_MEMES[team] 폴백, throw 안 함', async () => {
    // vitest.config 가 test env DATABASE_URL='' 강제 → getPrisma()=undefined.
    for (const team of ['hanwha', 'doosan', 'kia', 'lotte'] as const) {
      const meme = await fetchRandomMeme(team);
      expect(typeof meme).toBe('string');
      expect(meme.trim()).not.toBe('');
      // 랜덤이라 정확값 불가 → 해당 팀 후보 집합에 속함을 단언.
      expect(STATIC_MEMES[team]).toContain(meme);
    }
  });

  it('teamId undefined/null → default 폴백(공통 밈 후보 집합)', async () => {
    const m1 = await fetchRandomMeme(undefined);
    const m2 = await fetchRandomMeme(null);
    expect(STATIC_MEMES.default).toContain(m1);
    expect(STATIC_MEMES.default).toContain(m2);
  });

  it('미지 팀코드 → default 폴백', async () => {
    const meme = await fetchRandomMeme('unknown_team');
    expect(STATIC_MEMES.default).toContain(meme);
  });

  it('항상 비어있지 않은 문자열 반환(여러 회 호출)', async () => {
    for (let i = 0; i < 10; i++) {
      const meme = await fetchRandomMeme('lotte');
      expect(meme.length).toBeGreaterThan(0);
    }
  });
});
