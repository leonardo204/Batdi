/**
 * level-rules.ts — 레벨 규칙 미러 (P4-W10 10.4, api 측)
 *
 * SSOT: Ref-docs/specs/design/batdi-platform-ops.md §13 (레벨 시스템) /
 *       Ref-docs/specs/design/batdi-architecture.md ADR-049
 *
 * ⚠️ 미러 모듈: 원본은 apps/agent/src/personal/level-agent.ts(LEVEL_RULES/computeLevel).
 *   api 는 agent 워크스페이스를 import 하지 않으므로(빌드 경계 분리) 규칙을 여기에
 *   동일하게 미러링한다. 임계값/이름/해금 문구는 agent 측과 1:1 동기화 유지.
 *   변경 시 양쪽을 함께 갱신할 것.
 *
 * MVP 설계(ADR-049): 대화 횟수(turns) 기반 XP 단일 게이트.
 *   turns = message_count/2(user+assistant=2/턴), XP_PER_TURN=10
 *   → XP 임계 [0,500,2000,5000,10000](= turns 0/50/200/500/1000).
 */

/** 한 턴(user+assistant)당 부여 XP. turns × XP_PER_TURN = 누적 XP. */
export const XP_PER_TURN = 10;

/** 단일 레벨 규칙 — 레벨 번호·표시 이름·진입 XP 임계·해금 기능 설명. */
export interface LevelRule {
  level: number;
  name: string;
  minXp: number;
  unlocks: string;
}

/**
 * 5단계 레벨 규칙(minXp 오름차순). minXp 는 turns 0/50/200/500/1000 에 대응.
 * (agent level-agent.ts LEVEL_RULES 미러 — 변경 시 동기화.)
 */
export const LEVEL_RULES: readonly LevelRule[] = [
  { level: 1, name: '신입 팬', minXp: 0, unlocks: '기본 대화, 스코어' },
  { level: 2, name: '내야석', minXp: 500, unlocks: '경기 예측, 밈 강화' },
  { level: 3, name: '응원단석', minXp: 2000, unlocks: '두 번째 페르소나 스타일' },
  { level: 4, name: '시즌권', minXp: 5000, unlocks: '상세 통계, 선수 비교' },
  {
    level: 5,
    name: '12번째 선수',
    minXp: 10000,
    unlocks: '숨겨진 페르소나, 커스텀 닉네임',
  },
];

/** Lv1 규칙(클램프 폴백용 — LEVEL_RULES[0] 의 non-undefined 보장). */
const LEVEL_1_RULE: LevelRule = {
  level: 1,
  name: '신입 팬',
  minXp: 0,
  unlocks: '기본 대화, 스코어',
};

/**
 * message_count → 누적 XP. turns = floor(message_count/2)(user+assistant=2/턴).
 * 음수/NaN/비유한값은 0 으로 가드.
 */
export function xpFromMessageCount(messageCount: number): number {
  if (!Number.isFinite(messageCount) || messageCount <= 0) {
    return 0;
  }
  return Math.floor(messageCount / 2) * XP_PER_TURN;
}

/**
 * 누적 XP 가 도달한 최고 레벨(xp >= minXp 인 최대 level). 최소 1 보장.
 * 음수/NaN 은 Lv1 로 폴백.
 */
export function computeLevel(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) {
    return 1;
  }
  let result = 1;
  for (const rule of LEVEL_RULES) {
    if (xp >= rule.minXp) {
      result = rule.level;
    }
  }
  return result;
}

/** 레벨 번호 → 해당 LevelRule. 범위 밖이면 Lv1 규칙으로 클램프(항상 non-null). */
export function currentLevelRule(level: number): LevelRule {
  return LEVEL_RULES.find((r) => r.level === level) ?? LEVEL_1_RULE;
}

/** 레벨 번호 → 다음 LevelRule. 최고 레벨(Lv5)이면 null(더 오를 곳 없음). */
export function nextLevelRule(level: number): LevelRule | null {
  return LEVEL_RULES.find((r) => r.level === level + 1) ?? null;
}

/** 0~100 으로 클램프(진척률 안전). */
function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value >= 100 ? 100 : Math.floor(value);
}

/** /api/users/me/level 응답 형태. */
export interface LevelInfo {
  level: number;
  levelName: string;
  xp: number;
  currentMinXp: number;
  nextLevelXp: number | null;
  progressPercent: number;
  unlocks: string;
  allLevels: Array<{
    level: number;
    name: string;
    minXp: number;
    unlocks: string;
  }>;
}

/**
 * level/xpPoints → 레벨 정보 패키지(/api/users/me/level 응답).
 *
 * level 은 User 테이블 저장값이 아닌, xp 에서 항상 재계산해 드리프트를 0 으로 만든다.
 *   progressPercent: 현재 레벨 구간(currentMinXp ~ nextMinXp) 내 진척률 0~100.
 *   최고 레벨(Lv5)이면 nextLevelXp=null, progressPercent=100.
 */
export function buildLevelInfo(xpPoints: number): LevelInfo {
  const xp = Number.isFinite(xpPoints) && xpPoints > 0 ? Math.floor(xpPoints) : 0;
  const level = computeLevel(xp);
  const current = currentLevelRule(level);
  const next = nextLevelRule(level);

  const allLevels = LEVEL_RULES.map((r) => ({
    level: r.level,
    name: r.name,
    minXp: r.minXp,
    unlocks: r.unlocks,
  }));

  if (next === null) {
    // 최고 레벨 — 더 오를 곳 없음.
    return {
      level,
      levelName: current.name,
      xp,
      currentMinXp: current.minXp,
      nextLevelXp: null,
      progressPercent: 100,
      unlocks: current.unlocks,
      allLevels,
    };
  }

  const span = next.minXp - current.minXp;
  const gained = xp - current.minXp;
  const progressPercent = span > 0 ? clampPercent((gained / span) * 100) : 0;

  return {
    level,
    levelName: current.name,
    xp,
    currentMinXp: current.minXp,
    nextLevelXp: next.minXp,
    progressPercent,
    unlocks: current.unlocks,
    allLevels,
  };
}
