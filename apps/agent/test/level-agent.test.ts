/**
 * LevelAgent 순수 규칙 유닛 테스트 (P4-W10 10.3 — ADR-049)
 *
 * 부수효과 없는 순수 함수 검증: computeLevel 경계·xpFromMessageCount(DoD "대화 50회→Lv2")·
 * buildLevelProgress 포맷(currentLevel/xp/bar, Lv5 MAX, 진척 클램프)·LEVEL_RULES 불변식.
 */
import { describe, it, expect } from 'vitest';
import {
  XP_PER_TURN,
  LEVEL_RULES,
  xpFromTurns,
  xpFromMessageCount,
  computeLevel,
  currentLevelRule,
  nextLevelRule,
  buildLevelProgress,
} from '../src/personal/level-agent';

describe('LEVEL_RULES', () => {
  it('5단계 + minXp 오름차순 + level 1..5', () => {
    expect(LEVEL_RULES).toHaveLength(5);
    expect(LEVEL_RULES.map((r) => r.level)).toEqual([1, 2, 3, 4, 5]);
    expect(LEVEL_RULES.map((r) => r.minXp)).toEqual([0, 500, 2000, 5000, 10000]);
    // 엄격 오름차순 확인.
    for (let i = 1; i < LEVEL_RULES.length; i++) {
      expect(LEVEL_RULES[i].minXp).toBeGreaterThan(LEVEL_RULES[i - 1].minXp);
    }
  });

  it('XP_PER_TURN = 10', () => {
    expect(XP_PER_TURN).toBe(10);
  });
});

describe('xpFromTurns / xpFromMessageCount', () => {
  it('turns × 10', () => {
    expect(xpFromTurns(0)).toBe(0);
    expect(xpFromTurns(50)).toBe(500);
    expect(xpFromTurns(200)).toBe(2000);
  });

  it('음수/NaN/비유한 → 0 가드', () => {
    expect(xpFromTurns(-5)).toBe(0);
    expect(xpFromTurns(Number.NaN)).toBe(0);
    expect(xpFromTurns(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('message_count → floor(mc/2) × 10', () => {
    // DoD: 대화 50회(messageCount=100) → 500 XP → Lv2.
    expect(xpFromMessageCount(100)).toBe(500);
    expect(computeLevel(xpFromMessageCount(100))).toBe(2);
    // 홀수 message_count 는 floor(턴).
    expect(xpFromMessageCount(101)).toBe(500);
    expect(xpFromMessageCount(0)).toBe(0);
    expect(xpFromMessageCount(-10)).toBe(0);
  });
});

describe('computeLevel 경계', () => {
  it('XP 임계 경계 정확', () => {
    expect(computeLevel(0)).toBe(1);
    expect(computeLevel(499)).toBe(1);
    expect(computeLevel(500)).toBe(2);
    expect(computeLevel(1999)).toBe(2);
    expect(computeLevel(2000)).toBe(3);
    expect(computeLevel(4999)).toBe(3);
    expect(computeLevel(5000)).toBe(4);
    expect(computeLevel(9999)).toBe(4);
    expect(computeLevel(10000)).toBe(5);
    expect(computeLevel(999999)).toBe(5);
  });

  it('음수/NaN → Lv1 폴백', () => {
    expect(computeLevel(-100)).toBe(1);
    expect(computeLevel(Number.NaN)).toBe(1);
  });
});

describe('currentLevelRule / nextLevelRule', () => {
  it('current 는 항상 non-null(범위 밖 클램프 Lv1)', () => {
    expect(currentLevelRule(2).name).toBe('내야석');
    expect(currentLevelRule(99).level).toBe(1);
    expect(currentLevelRule(0).level).toBe(1);
  });

  it('next 는 다음 레벨, Lv5 면 null', () => {
    expect(nextLevelRule(1)?.level).toBe(2);
    expect(nextLevelRule(4)?.level).toBe(5);
    expect(nextLevelRule(5)).toBeNull();
  });
});

describe('buildLevelProgress 포맷', () => {
  it('currentLevel = "Lv{n} {name}"', () => {
    expect(buildLevelProgress(2, 500).currentLevel).toBe('Lv2 내야석');
    expect(buildLevelProgress(1, 0).currentLevel).toBe('Lv1 신입 팬');
  });

  it('xp 슬롯: next 있으면 "{xp} / {nextMinXp} XP"', () => {
    expect(buildLevelProgress(1, 0).xp).toBe('0 / 500 XP');
    expect(buildLevelProgress(2, 1400).xp).toBe('1400 / 2000 XP');
  });

  it('bar 진척률 — 10칸 블록 + %', () => {
    // Lv2(500) → Lv3(2000), span=1500. xp=1400 → gained=900 → 60%.
    const out = buildLevelProgress(2, 1400);
    expect(out.bar).toBe('██████░░░░ 60%');
  });

  it('진척 0% — 레벨 막 진입', () => {
    const out = buildLevelProgress(2, 500);
    expect(out.bar).toBe('░░░░░░░░░░ 0%');
    expect(out.bar).toContain('0%');
  });

  it('Lv5 → MAX(진척 없음)', () => {
    const out = buildLevelProgress(5, 12345);
    expect(out.currentLevel).toBe('Lv5 12번째 선수');
    expect(out.xp).toBe('12345 XP (MAX)');
    expect(out.bar).toBe('██████████ MAX');
  });

  it('진척 클램프 — 100 초과/음수 안전', () => {
    // 비정상적으로 큰 xp(다음 레벨 초과)도 100% 클램프(레벨은 호출부가 보정).
    const over = buildLevelProgress(2, 99999);
    expect(over.bar).toBe('██████████ 100%');
    // 음수 xp → 0 가드.
    const neg = buildLevelProgress(1, -50);
    expect(neg.bar).toBe('░░░░░░░░░░ 0%');
    expect(neg.xp).toBe('0 / 500 XP');
  });
});
