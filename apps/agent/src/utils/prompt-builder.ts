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
 * W7: 우선 지원 4팀(hanwha/doosan/kia/lotte) 페르소나를 모두 구현한다.
 *   미지정(undefined)·범위 외 teamId 는 hanwha 페르소나로 폴백한다(중립 폴백).
 */
import type { PersonalContext, TeamId } from '@batdi/types';
import type { ConversationMemory } from '../services/memory';
import { ChildSafetyGuardrail } from '../nodes/child-safety';
import { isPersonalized } from '../personal/personal-agent';
import {
  HANWHA_PERSONA_BODY,
  HANWHA_STYLE,
  HANWHA_CANNED,
} from '../templates/personas/hanwha';
import {
  DOOSAN_PERSONA_BODY,
  DOOSAN_STYLE,
  DOOSAN_CANNED,
} from '../templates/personas/doosan';
import { KIA_PERSONA_BODY, KIA_STYLE, KIA_CANNED } from '../templates/personas/kia';
import {
  LOTTE_PERSONA_BODY,
  LOTTE_STYLE,
  LOTTE_CANNED,
} from '../templates/personas/lotte';

/** team_persona 블록 조립용 페르소나 레코드 */
interface TeamPersona {
  /** `<team>` 태그 값 (TeamId) */
  team: TeamId;
  /** `<style>` 한 줄 요약 */
  style: string;
  /** 페르소나 프롬프트 본문 */
  body: string;
  /** 키 미설정/폴백용 팀 톤 캔드 리액션 (수치 없음) */
  canned: string;
}

/**
 * teamId → TeamPersona 매핑 (W7: 우선 지원 4팀 전부).
 */
const PERSONA_BY_TEAM: Record<TeamId, TeamPersona> = {
  hanwha: {
    team: 'hanwha',
    style: HANWHA_STYLE,
    body: HANWHA_PERSONA_BODY,
    canned: HANWHA_CANNED,
  },
  doosan: {
    team: 'doosan',
    style: DOOSAN_STYLE,
    body: DOOSAN_PERSONA_BODY,
    canned: DOOSAN_CANNED,
  },
  kia: {
    team: 'kia',
    style: KIA_STYLE,
    body: KIA_PERSONA_BODY,
    canned: KIA_CANNED,
  },
  lotte: {
    team: 'lotte',
    style: LOTTE_STYLE,
    body: LOTTE_PERSONA_BODY,
    canned: LOTTE_CANNED,
  },
};

/**
 * teamId 에 매핑된 TeamPersona 를 반환한다.
 * 미지정(undefined)·범위 외면 hanwha 페르소나로 폴백(중립 폴백).
 */
export function resolveTeamPersona(teamId: TeamId | undefined): TeamPersona {
  const persona = teamId ? PERSONA_BY_TEAM[teamId] : undefined;
  return persona ?? PERSONA_BY_TEAM.hanwha;
}

/**
 * teamId 에 맞는 팀 톤 캔드 리액션을 반환한다(수치 없음).
 * GOOGLE_API_KEY 미설정·LLM 실패·OutputGuardrail 교체 시의 graceful 폴백용.
 */
export function cannedReactionFor(teamId: TeamId | undefined): string {
  return resolveTeamPersona(teamId).canned;
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
  /**
   * 개인화 컨텍스트(P2-W6 6.3). 의미있는 개인화 정보(isPersonalized)가 있을 때만
   * `<personal_profile priority="3">` 블록을 system_base(1)와 team_persona(4) 사이에
   * 삽입한다(priority 순서). 중립 기본값/미지정이면 블록을 생략한다(프롬프트 변화 없음).
   */
  personalContext?: PersonalContext;
  /**
   * 대화 메모리(P3-W9 9.2). session/long-term 요약이 있으면 personal_profile 다음에
   * `<conversation_memory priority="3">` 블록을 삽입한다. 비어있으면 블록 생략.
   */
  conversationMemory?: ConversationMemory;
}

/** knowledgeLevel → 프롬프트 톤 가이드 한 줄 */
const KNOWLEDGE_LEVEL_HINT: Record<
  PersonalContext['profile']['knowledgeLevel'],
  string
> = {
  beginner: '야구 입문자 — 어려운 용어는 풀어서 쉽게 설명하라.',
  core: '핵심 팬 — 적당한 전문 용어를 자연스럽게 섞어도 좋다.',
  expert: '하드코어 팬 — 세이버메트릭스 등 깊은 디테일을 다뤄도 된다.',
};

/**
 * `<personal_profile priority="3">` 블록을 조립한다(개인화 정보 있을 때만).
 * 개인화 정보가 전혀 없으면(isPersonalized=false) 빈 문자열을 반환해 블록을 생략한다.
 *
 * 포함: knowledgeLevel(톤), customPersona(있으면), isReturningUser 힌트.
 * ⚠️ 팩트(수치) 주입 금지 계약은 그대로 — 여기엔 톤/페르소나 메타만 담는다.
 */
export function buildPersonalProfileBlock(ctx: PersonalContext | undefined): string {
  if (!isPersonalized(ctx) || !ctx) {
    return '';
  }
  const lines: string[] = [];
  lines.push(`  <knowledge_level>${ctx.profile.knowledgeLevel}</knowledge_level>`);
  lines.push(`  ${KNOWLEDGE_LEVEL_HINT[ctx.profile.knowledgeLevel]}`);
  if (ctx.hints.hasCustomPersona && ctx.profile.customPersona) {
    lines.push(
      `  <custom_persona>${ctx.profile.customPersona.trim()}</custom_persona>`,
    );
  }
  if (ctx.hints.isReturningUser) {
    lines.push('  다시 찾아온 친구야 — 반갑게 맞이하되 과하지 않게.');
  }
  return `<personal_profile priority="3">
${lines.join('\n')}
</personal_profile>

`;
}

/**
 * `<conversation_memory priority="3">` 블록을 조립한다(P3-W9 9.2).
 *
 * 3단계 메모리 중 프롬프트에 주입할 두 요약을 담는다(있을 때만 하위 태그 추가):
 *  - `<session_summary>`: 세션(overflow) 증분 요약 — 직전 대화 흐름의 개인화 단서.
 *  - `<long_term_profile>`: 장기 프로필 요약(PersonalAgentState.profileSummary, 세션 간 학습).
 *
 * 둘 다 비어있으면 빈 문자열을 반환해 블록을 생략한다(프롬프트 변화 없음).
 * working memory 자체는 chat-graph 가 state.messages.slice 로 LLM 에 직접 전달하므로 여기 없다.
 * ⚠️ 팩트(수치) 주입 금지 계약 동일 — 요약은 톤/개인화 단서만(요약기 프롬프트에서 환각 금지).
 */
export function buildConversationMemoryBlock(
  memory: ConversationMemory | undefined,
): string {
  if (!memory) {
    return '';
  }
  const sessionSummary = memory.sessionSummary?.trim() ?? '';
  const longTermSummary = memory.longTermSummary?.trim() ?? '';
  if (sessionSummary === '' && longTermSummary === '') {
    return '';
  }
  const lines: string[] = [];
  if (sessionSummary !== '') {
    lines.push(`  <session_summary>${sessionSummary}</session_summary>`);
  }
  if (longTermSummary !== '') {
    lines.push(`  <long_term_profile>${longTermSummary}</long_term_profile>`);
  }
  return `<conversation_memory priority="3">
${lines.join('\n')}
</conversation_memory>

`;
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
  const { teamId, scoreSummary, userMessage, personalContext, conversationMemory } =
    input;
  const persona = resolveTeamPersona(teamId);

  const systemBase = `${ChildSafetyGuardrail.SYSTEM_INSTRUCTION.trim()}

${REACTION_SYSTEM_DIRECTIVE}`;

  // priority=3 personal_profile — system_base(1) 와 team_persona(4) 사이에 삽입.
  // 개인화 정보 없으면 빈 문자열(블록 생략 → 프롬프트 변화 없음).
  const personalProfileBlock = buildPersonalProfileBlock(personalContext);
  // priority=3 conversation_memory — personal_profile 바로 다음(둘 다 priority=3 컨텍스트).
  const conversationMemoryBlock =
    buildConversationMemoryBlock(conversationMemory);

  return `<system_base priority="1" immutable="true">
${systemBase}
</system_base>

${personalProfileBlock}${conversationMemoryBlock}<team_persona priority="4">
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

/**
 * system_base(priority=1) 의 chat(일반 대화) 전용 지시.
 *
 * ⚠️ 리액션(buildReactionPrompt)과 달리 chat 은 "숫자 절대 금지"가 아니다(일반 대화이므로
 *   자연스러운 수치 언급 가능). 다만 **모르는 수치·기록·일정을 지어내는 것(환각)** 은 금지한다.
 *   팩트(점수/순위 등 정밀 데이터)는 카드({{bind}} 슬롯, DataBinder)로 제공된다.
 *
 * 핵심 지시:
 *  - 정체성: 너는 밧디(batdi), KBO 야구 친구.
 *  - off-topic 전환: 금융·정치·개발 등 야구 무관 주제는 페르소나 유지한 채 자연스럽게
 *    야구 화제로 전환. 단 가벼운 일상 잡담은 허용(딱딱하게 거절하지 않는다).
 *  - 환각 금지: 모르는 수치·기록·일정은 지어내지 말고 모른다고 답하라.
 *  - 길이: 1~3문장, 친근하게.
 */
const CHAT_SYSTEM_DIRECTIVE = `너는 밧디(batdi), KBO 야구 친구야. 너의 야구 친구로서 친근하게 대화하라.
금융·정치·개발 등 야구와 무관한 주제는 페르소나를 유지한 채 자연스럽게 야구 화제로 전환하라. 가벼운 일상 잡담은 허용.
모르는 수치·기록·일정은 지어내지 말고 모른다고 답하라(팩트는 카드로 제공됨).
응답 길이는 1~3문장, 친근하게.`;

/** buildChatPrompt 입력 */
export interface BuildChatPromptInput {
  /** 사용자 응원 팀 (teamId 채널) */
  teamId: TeamId | undefined;
  /** 사용자 원문 메시지 */
  userMessage: string;
  /**
   * 개인화 컨텍스트(P2-W6 6.3). 의미있는 개인화 정보(isPersonalized)가 있을 때만
   * `<personal_profile priority="3">` 블록을 system_base(1)와 team_persona(4) 사이에
   * 삽입한다(priority 순서). 중립 기본값/미지정이면 블록을 생략한다.
   */
  personalContext?: PersonalContext;
  /**
   * 대화 메모리(P3-W9 9.2). session/long-term 요약이 있으면 personal_profile 다음에
   * `<conversation_memory priority="3">` 블록을 삽입한다. 비어있으면 블록 생략.
   */
  conversationMemory?: ConversationMemory;
}

/**
 * chat intent(일반 대화)용 시스템 프롬프트(XML)를 조립한다 (P3-W8 8.1).
 *
 * buildReactionPrompt 와 평행 구조 — 동일한 블록 헬퍼(ChildSafety SYSTEM_INSTRUCTION,
 * buildPersonalProfileBlock, resolveTeamPersona)를 재사용한다. 차이점:
 *  - system_base 지시가 리액션 전용(수치 금지)이 아니라 chat 전용(off-topic 전환·환각 금지·
 *    1~3문장)이다.
 *  - current_situation 의 game(scoreSummary)이 없다 — chat 은 경기 맥락에 종속되지 않는다.
 *    사용자 메시지(user_message)만 맥락으로 둔다(실제 메시지는 HumanMessage 로도 전달).
 *
 * architecture §9.1 규격:
 *  - `<system_base priority="1" immutable="true">`: ChildSafety SYSTEM_INSTRUCTION + chat 지시
 *  - `<personal_profile priority="3">`: 개인화 정보 있을 때만(buildPersonalProfileBlock)
 *  - `<team_persona priority="4">`: <team>/<style>/본문
 *  - `<priority_rules>`: system_base 불변 우선
 *
 * @returns 조립된 시스템 프롬프트 문자열 (Context Caching 미사용 — 매 요청 주입)
 */
export function buildChatPrompt(input: BuildChatPromptInput): string {
  const { teamId, userMessage, personalContext, conversationMemory } = input;
  const persona = resolveTeamPersona(teamId);

  const systemBase = `${ChildSafetyGuardrail.SYSTEM_INSTRUCTION.trim()}

${CHAT_SYSTEM_DIRECTIVE}`;

  // priority=3 personal_profile — system_base(1) 와 team_persona(4) 사이에 삽입.
  // 개인화 정보 없으면 빈 문자열(블록 생략).
  const personalProfileBlock = buildPersonalProfileBlock(personalContext);
  // priority=3 conversation_memory — personal_profile 바로 다음(둘 다 priority=3 컨텍스트).
  const conversationMemoryBlock =
    buildConversationMemoryBlock(conversationMemory);

  return `<system_base priority="1" immutable="true">
${systemBase}
</system_base>

${personalProfileBlock}${conversationMemoryBlock}<team_persona priority="4">
  <team>${persona.team}</team>
  <style>${persona.style}</style>
${persona.body}
</team_persona>

<current_situation>
  <user_message>${userMessage}</user_message>
</current_situation>

<priority_rules>
우선순위 숫자가 낮을수록 강함. priority=1(system_base)은 불변이며 절대 우회 불가.
team_persona(priority=4) 스타일보다 system_base 의 안전·환각 금지 지시가 항상 우선한다.
</priority_rules>`;
}
