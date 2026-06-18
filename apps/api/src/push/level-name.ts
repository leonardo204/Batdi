/**
 * level-name.ts — 레벨 번호 → 레벨 이름 (P4-W11 — ADR-055 보조).
 *
 * SSOT: apps/agent/src/personal/level-agent.ts LEVEL_RULES(ADR-049).
 *
 * api 패키지는 tsconfig(Node16/CommonJS)가 ESM 패키지 @batdi/types 또는 agent 소스를
 * 직접 끌어오면 모듈해상도 충돌이 난다(auth.provider.ts 가 동일 이유로 시그니처를 재선언).
 * 같은 패턴으로 레벨 이름 매핑만 본 파일에 재선언한다 — LEVEL_RULES 변경 시 양쪽을 함께 갱신한다.
 * (레벨업 푸시 본문에 "Lv{n} {name}" 을 넣기 위함.)
 */

/** 레벨 번호 → 이름. agent LEVEL_RULES 와 동일 값(SSOT 동기화 대상). */
const LEVEL_NAMES: Readonly<Record<number, string>> = {
  1: '신입 팬',
  2: '내야석',
  3: '응원단석',
  4: '시즌권',
  5: '12번째 선수',
};

/** 레벨 번호 → 레벨 이름. 범위 밖이면 Lv1 이름으로 클램프(항상 non-null). */
export function currentLevelRule(level: number): { level: number; name: string } {
  const name = LEVEL_NAMES[level] ?? LEVEL_NAMES[1] ?? '신입 팬';
  return { level, name };
}
