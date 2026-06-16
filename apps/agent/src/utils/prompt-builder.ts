/**
 * XML PromptBuilder — L2 리액션 시스템 프롬프트 조립 (P2-W6, 4.8)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §9.1 (XML 프롬프트 조립 규격),
 *       Ref-docs/specs/design/batdi-persona-guardrail.md §4.3 (한화 페르소나),
 *       §6.2-F (ChildSafety SYSTEM_INSTRUCTION)
 *
 * architecture §9.1 의 XML 태그 경계(system_base/team_persona/current_situation 등)와
 * priority 규격에 맞춰 시스템 프롬프트 문자열을 조립하는 **순수 함수**.
 *
 * 핵심 안전 규칙 (CLAUDE.md):
 *  - 팩트(점수/이닝 등 수치)는 LLM 생성 절대 금지 → 카드 {{bind}} 슬롯(DataBinder)만.
 *  - 리액션은 `{{llm.reaction}}` 슬롯에 들어갈 감정/응원/사투리 톤 텍스트만 생성.
 *    리액션 텍스트에 숫자 언급 금지를 system_base(priority=1)에서 강하게 지시(1차 방어).
 *  - Context Caching 미사용(§6.3) — 전체 프롬프트를 매 요청마다 주입.
 *
 * ⚠️ teamId 별 분기는 설계상 확장 가능하나, 이번(W6)엔 hanwha 만 구현한다.
 *   미구현 팀(lotte/doosan/kia)은 W7 까지 hanwha 페르소나로 폴백한다(중립 폴백).
 */
import type { TeamId } from '@batdi/types';
import { ChildSafetyGuardrail } from '../nodes/child-safety';
import {
  HANWHA_PERSONA_BODY,
  HANWHA_STYLE,
} from '../templates/personas/hanwha';

/** team_persona 블록 조립용 페르소나 레코드 */
interface TeamPersona {
  /** `<team>` 태그 값 (TeamId) */
  team: TeamId;
  /** `<style>` 한 줄 요약 */
  style: string;
  /** 페르소나 프롬프트 본문 */
  body: string;
}

/**
 * teamId → TeamPersona 매핑.
 * W6: hanwha 만 구현. (W7 에 lotte/doosan/kia 추가 예정)
 */
const PERSONA_BY_TEAM: Partial<Record<TeamId, TeamPersona>> = {
  hanwha: {
    team: 'hanwha',
    style: HANWHA_STYLE,
    body: HANWHA_PERSONA_BODY,
  },
};

/**
 * teamId 에 매핑된 TeamPersona 를 반환한다.
 * 미구현 팀이면 hanwha 페르소나로 폴백(W6 중립 폴백 — W7 에서 팀별 분리).
 */
export function resolveTeamPersona(teamId: TeamId | undefined): TeamPersona {
  const persona = teamId ? PERSONA_BY_TEAM[teamId] : undefined;
  // PERSONA_BY_TEAM.hanwha 는 항상 존재 — 폴백 안전.
  return persona ?? (PERSONA_BY_TEAM.hanwha as TeamPersona);
}

/** system_base(priority=1) 의 리액션 전용 지시 — 수치 금지 강제(1차 방어) */
const REACTION_SYSTEM_DIRECTIVE = `너는 밧디(batdi). 너의 야구 친구야.
수치·점수·이닝 등 숫자는 절대 언급하지 마라(카드에 이미 표시됨).
감정·응원·사투리 톤의 짧은 리액션(1~2문장, 50토큰 이내)만 생성하라.
숫자(예: 5, 3, 7회)나 스코어 표기는 한 글자도 쓰지 마라.`;

/** buildReactionPrompt 입력 */
export interface BuildReactionPromptInput {
  /** 사용자 응원 팀 (teamId 채널) */
  teamId: TeamId | undefined;
  /**
   * 현재 스코어 요약 (예: "롯데 5 : 두산 3, 7회말").
   * ⚠️ LLM 에 맥락으로만 제공하고, 리액션 텍스트엔 숫자를 쓰지 말라고 지시한다.
   */
  scoreSummary: string;
  /** 사용자 원문 메시지 */
  userMessage: string;
}

/**
 * L2 리액션 생성용 시스템 프롬프트(XML)를 조립한다.
 *
 * architecture §9.1 규격:
 *  - `<system_base priority="1" immutable="true">`: ChildSafety SYSTEM_INSTRUCTION + 리액션 지시(수치 금지)
 *  - `<team_persona priority="4">`: <team>/<style>/본문
 *  - `<current_situation>`: <game>(scoreSummary, 맥락용) + <user_message>
 *  - `<priority_rules>`: 우선순위 충돌 해결
 *
 * @returns 조립된 시스템 프롬프트 문자열 (Context Caching 미사용 — 매 요청 주입)
 */
export function buildReactionPrompt(input: BuildReactionPromptInput): string {
  const { teamId, scoreSummary, userMessage } = input;
  const persona = resolveTeamPersona(teamId);

  const systemBase = `${ChildSafetyGuardrail.SYSTEM_INSTRUCTION.trim()}

${REACTION_SYSTEM_DIRECTIVE}`;

  return `<system_base priority="1" immutable="true">
${systemBase}
</system_base>

<team_persona priority="4">
  <team>${persona.team}</team>
  <style>${persona.style}</style>
${persona.body}
</team_persona>

<current_situation>
  <game>${scoreSummary}</game>
  <user_message>${userMessage}</user_message>
</current_situation>

<priority_rules>
우선순위 숫자가 낮을수록 강함. priority=1(system_base)은 불변이며 절대 우회 불가.
team_persona(priority=4) 스타일보다 system_base 의 수치 금지 지시가 항상 우선한다.
</priority_rules>`;
}

/** 키 미설정 시 사용할 한화 톤 캔드 리액션 (수치 없음) */
export const CANNED_REACTION_HANWHA = '오 좋은데유~ 끝까지 응원해유! 화이팅이여!';
