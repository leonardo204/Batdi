/**
 * level-guard.ts — 레벨 해금 게이팅 (ADR-053).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-053 (레벨 해금 게이팅).
 *
 * 레벨이 레이블만이고 실 제한이 없던 문제를 해결한다. 해금 기능 호출 시
 *   requireLevel(user.level, min) 으로 검증해, 미달이면 403 { locked } 을 던진다.
 *
 * 게이팅 매트릭스(ADR-053):
 *   - 상세 통계(showPlayerDetail) : Lv4(시즌권)
 *   - 선수/팀 비교(showTeamComparison) : Lv4(시즌권)
 *   - 커스텀 닉네임(PATCH users/me/nickname) : Lv5(12번째 선수)
 *
 * 레벨 이름은 level-rules.ts 의 LEVEL_RULES 를 재사용한다(중복 정의 금지).
 */
import { ForbiddenException } from '@nestjs/common';
import { currentLevelRule } from './level-rules';

/**
 * userLevel 이 min 미만이면 ForbiddenException(403) 을 던진다.
 *
 * 던지는 payload: { locked:true, requiredLevel:min, levelName:<min 레벨 이름> }.
 *   프론트는 locked 플래그로 해금 안내 UI(필요 레벨/레벨명)를 렌더한다.
 *   userLevel >= min 이면 아무 일도 하지 않고 통과(void).
 */
export function requireLevel(userLevel: number, min: number): void {
  const level = Number.isFinite(userLevel) ? userLevel : 1;
  if (level < min) {
    throw new ForbiddenException({
      locked: true,
      requiredLevel: min,
      levelName: currentLevelRule(min).name,
    });
  }
}
