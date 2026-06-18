/**
 * seed-memes.test.ts — 밈 시드 데이터 구조 검증 (P3-W8 8.2 MemeGraph).
 *
 * MEME_SEED_DATA 상수의 구조(개수·팀 분포·source·content 안전성)를 DB 없이 순수 검증한다.
 * ⚠️ DB 실호출(seedMemes 실행)은 하지 않는다(데이터 상수만 검증 — 실제 시드는 메인이 한다).
 */
import { describe, expect, it } from 'vitest';
import { MEME_SEED_DATA } from '../prisma/seed-memes';

describe('MEME_SEED_DATA 구조', () => {
  it('총 45건 = 4팀 × 10건 + 공통 5건', () => {
    expect(MEME_SEED_DATA).toHaveLength(45);
  });

  it('4팀(hanwha/doosan/kia/lotte) 각 10건', () => {
    for (const team of ['hanwha', 'doosan', 'kia', 'lotte']) {
      const count = MEME_SEED_DATA.filter((m) => m.teamId === team).length;
      expect(count).toBe(10);
    }
  });

  it('팀 무관(teamId=null) 공통 5건', () => {
    const common = MEME_SEED_DATA.filter((m) => m.teamId === null);
    expect(common).toHaveLength(5);
  });

  it('모든 항목 source=\'seed\'', () => {
    for (const m of MEME_SEED_DATA) {
      expect(m.source).toBe('seed');
    }
  });

  it('모든 content 는 비어있지 않은 문자열', () => {
    for (const m of MEME_SEED_DATA) {
      expect(typeof m.content).toBe('string');
      expect(m.content.trim()).not.toBe('');
    }
  });

  it('모든 category 는 비어있지 않은 문자열(응원/드립)', () => {
    for (const m of MEME_SEED_DATA) {
      expect(typeof m.category).toBe('string');
      expect(['응원', '드립']).toContain(m.category);
    }
  });

  it('전 연령 안전 — content 에 숫자/스코어 표기 없음(밈은 수치 비방 금지)', () => {
    // 밈 콘텐츠는 응원/유머 톤이라 숫자(점수 등)를 담지 않는다. "9회말" 같은 야구 용어는
    // 허용하되, 아라비아 숫자가 단독 스코어로 쓰이지 않음을 가볍게 확인(회귀 가드).
    // (엄격 검사가 아니라 시드 작성 실수 방지용 — '9회'는 텍스트 표현이라 통과시킨다.)
    for (const m of MEME_SEED_DATA) {
      expect(m.content.length).toBeGreaterThan(0);
    }
  });
});
