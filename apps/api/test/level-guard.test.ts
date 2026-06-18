/**
 * level-guard.test.ts — requireLevel 게이팅 유닛 테스트 (ADR-053).
 *
 * - userLevel >= min → 통과(throw 안 함).
 * - userLevel < min → ForbiddenException { locked, requiredLevel, levelName }.
 *   levelName 은 LEVEL_RULES 의 해당 레벨 이름과 일치.
 */
import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { requireLevel } from '../src/users/level-guard';

describe('level-guard.requireLevel', () => {
  it('userLevel >= min → 통과(throw 없음)', () => {
    expect(() => requireLevel(4, 4)).not.toThrow();
    expect(() => requireLevel(5, 4)).not.toThrow();
    expect(() => requireLevel(5, 5)).not.toThrow();
  });

  it('userLevel < min → ForbiddenException', () => {
    expect(() => requireLevel(3, 4)).toThrow(ForbiddenException);
    expect(() => requireLevel(1, 5)).toThrow(ForbiddenException);
  });

  it('Lv4 미달 → locked payload + 시즌권 이름', () => {
    try {
      requireLevel(3, 4);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const res = (e as ForbiddenException).getResponse() as {
        locked: boolean;
        requiredLevel: number;
        levelName: string;
      };
      expect(res.locked).toBe(true);
      expect(res.requiredLevel).toBe(4);
      expect(res.levelName).toBe('시즌권');
    }
  });

  it('Lv5 미달 → locked payload + 12번째 선수 이름', () => {
    try {
      requireLevel(4, 5);
      throw new Error('should have thrown');
    } catch (e) {
      const res = (e as ForbiddenException).getResponse() as {
        locked: boolean;
        requiredLevel: number;
        levelName: string;
      };
      expect(res.locked).toBe(true);
      expect(res.requiredLevel).toBe(5);
      expect(res.levelName).toBe('12번째 선수');
    }
  });

  it('비유한 userLevel → Lv1 로 폴백(게이팅 적용)', () => {
    expect(() => requireLevel(Number.NaN, 4)).toThrow(ForbiddenException);
  });
});
