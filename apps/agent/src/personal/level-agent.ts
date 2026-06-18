/**
 * LevelAgent 순수 규칙 모듈 (P4-W10 10.3 — 5단계 레벨 규칙)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-049,
 *       Ref-docs/specs/design/batdi-platform-ops.md §13 (레벨 시스템)
 *
 * MVP 설계 결정(ADR-049): 예측·연속일·적중률 고급 게이트는 미구현 기능이라
 *   **MVP 는 대화 횟수(turns) 기반 XP 단일 게이트**로 레벨을 산정한다.
 *   turns = message_count/2(user+assistant=2/턴, write-through SSOT).
 *   XP_PER_TURN=10 → XP 임계 [0,500,2000,5000,10000](= turns 0/50/200/500/1000).
 *
 * 전부 순수 함수(부수효과·DB 접근 0). XP/level 은 message_count 에서 항상 재계산되어
 *   드리프트/중복이 0 인 멱등 recompute 의 토대가 된다.
 *
 * ⚠️ buildLevelProgress 가 만드는 currentLevel/bar/xp 문자열은 정적 계산(진척 표시)이며
 *   감정/팩트가 아니므로 ADR-019(LLM 리터럴 차단) 대상이 아니다. levelProgressWidget(8.3)의
 *   `level.currentLevel/bar/xp` bind 슬롯을 DataBinder 가 이 값으로 채운다.
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
 * (Lv2 대화50회·Lv3 200·Lv4 500·Lv5 1000 — DoD "대화 50회 → Lv2".)
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

/** 진척 바 칸 수(10칸 블록). */
const BAR_SLOTS = 10;
const BAR_FILLED = '█';
const BAR_EMPTY = '░';

/**
 * turns → 누적 XP. 음수/NaN/비유한값은 0 으로 가드(best-effort 산정).
 */
export function xpFromTurns(turns: number): number {
  if (!Number.isFinite(turns) || turns <= 0) {
    return 0;
  }
  return Math.floor(turns) * XP_PER_TURN;
}

/**
 * message_count → 누적 XP. turns = floor(message_count/2)(user+assistant=2/턴).
 * 음수/NaN/비유한값은 0 으로 가드.
 */
export function xpFromMessageCount(messageCount: number): number {
  if (!Number.isFinite(messageCount) || messageCount <= 0) {
    return 0;
  }
  return xpFromTurns(Math.floor(messageCount / 2));
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

/**
 * 레벨 번호 → 해당 LevelRule. 범위 밖이면 Lv1 규칙으로 클램프(항상 non-null).
 */
export function currentLevelRule(level: number): LevelRule {
  return LEVEL_RULES.find((r) => r.level === level) ?? LEVEL_1_RULE;
}

/**
 * 레벨 번호 → 다음 LevelRule. 최고 레벨(Lv5)이면 null(더 오를 곳 없음).
 */
export function nextLevelRule(level: number): LevelRule | null {
  return LEVEL_RULES.find((r) => r.level === level + 1) ?? null;
}

/**
 * 0~100 으로 클램프(진척률 안전).
 */
function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value >= 100 ? 100 : Math.floor(value);
}

/**
 * levelProgressWidget(8.3)용 사전 포맷 데이터(정적 계산, LLM 무관).
 *
 * @param level 현재 레벨(computeLevel 결과)
 * @param xp    누적 XP(xpFromMessageCount 결과)
 * @returns level.currentLevel/bar/xp 슬롯 문자열
 *   - currentLevel: `Lv${level} ${name}` (예 "Lv2 내야석")
 *   - xp: next 있으면 `${xp} / ${nextMinXp} XP`, Lv5 면 `${xp} XP (MAX)`
 *   - bar: 현재→다음 레벨 진척률을 10칸 블록으로(예 "██████░░░░ 60%"), Lv5 면 "██████████ MAX"
 */
export function buildLevelProgress(
  level: number,
  xp: number,
): { currentLevel: string; bar: string; xp: string } {
  const current = currentLevelRule(level);
  const next = nextLevelRule(level);
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;

  const currentLevel = `Lv${current.level} ${current.name}`;

  if (next === null) {
    // 최고 레벨 — 진척 없음(MAX).
    return {
      currentLevel,
      bar: `${BAR_FILLED.repeat(BAR_SLOTS)} MAX`,
      xp: `${safeXp} XP (MAX)`,
    };
  }

  // 현재 레벨 구간 내 진척률(현재 minXp ~ 다음 minXp).
  const span = next.minXp - current.minXp;
  const gained = safeXp - current.minXp;
  const percent =
    span > 0 ? clampPercent((gained / span) * 100) : 0;
  const filled = Math.round((percent / 100) * BAR_SLOTS);
  const bar = `${BAR_FILLED.repeat(filled)}${BAR_EMPTY.repeat(
    BAR_SLOTS - filled,
  )} ${percent}%`;

  return {
    currentLevel,
    bar,
    xp: `${safeXp} / ${next.minXp} XP`,
  };
}
