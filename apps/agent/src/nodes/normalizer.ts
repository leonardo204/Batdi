/**
 * Normalizer 노드 — userMessage → normalized/display form
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.3 (입력 정규화 3-form)
 *
 *  - userMessage          : 원문 그대로 (LLM 전달·저장용) — 변경 안 함
 *  - userMessageDisplay   : NFKC만 적용 (화면 표시용) → toDisplayForm
 *  - userMessageNormalized: NFKC + 공백/zero-width/이모지·구분자 제거 +
 *                           반복 문자 축소 + homoglyph 치환 + 소문자
 *                           (필터 매칭용, 사용자 노출 금지) → toNormalizedForm
 *
 * ⚠️ ADR-051: 정규화 순수 함수(toNormalizedForm/toDisplayForm)는 @batdi/guardrail 로
 *   추출되어 agent·api 가 공유한다(보안 룰 drift 차단, 단일 SSOT). 본 모듈은 LangGraph
 *   노드 로직(메시지 추출·신원 해석)만 보유하고, 기존 import 경로 호환을 위해 두 함수를
 *   re-export 한다(`import { toNormalizedForm } from '../nodes/normalizer'` 그대로 동작).
 */
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import type { TeamId } from '@batdi/types';
import { toNormalizedForm, toDisplayForm } from '@batdi/guardrail';
import { messageText } from '../utils/message-text';

// 기존 호출처/테스트 호환을 위한 re-export (정규화 구현 SSOT 는 @batdi/guardrail).
export { toNormalizedForm, toDisplayForm };

/** BaseMessage 가 Human(사용자) 메시지인지 */
function isHumanMessage(message: BaseMessage): boolean {
  return message.getType() === 'human';
}

/**
 * 신원(userId/teamId)을 그래프 진입 직후 1회 해석한다(P3-W9 9.3 신원 배선).
 *
 * 전달 채널(조사 결과): 프론트 `<CopilotKit properties={{ config:{ configurable:{ userId, teamId } } }}>`
 *   → @ag-ui/langgraph 가 RunsStreamPayload.config 로 보존(context_schema 없음 → configurable
 *   키 드롭 안 됨) → LangGraph 런타임이 노드 2번째 인자 config.configurable 로 노출.
 *
 * 방어적 우선순위(미니파이드 소스 역공학 결론이라 실제 도달 위치를 방어):
 *   1) 이미 state 에 값이 있으면(테스트 invoke `{userId,...}`) **보존**(덮어쓰지 않음).
 *   2) 없으면 config.configurable.userId / .teamId 에서 승격.
 * 둘 다 없으면 해당 필드를 반환하지 않아(undefined) state 기본값을 유지한다(익명).
 */
function resolveIdentity(
  state: CoreGraphState,
  config: RunnableConfig | undefined,
): { userId?: string; teamId?: TeamId } {
  const configurable = config?.configurable as
    | { userId?: unknown; teamId?: unknown }
    | undefined;

  const out: { userId?: string; teamId?: TeamId } = {};

  // userId: state 우선 → config 폴백.
  const stateUserId =
    typeof state.userId === 'string' && state.userId.trim() !== ''
      ? state.userId
      : undefined;
  const configUserId =
    typeof configurable?.userId === 'string' &&
    configurable.userId.trim() !== ''
      ? configurable.userId
      : undefined;
  const resolvedUserId = stateUserId ?? configUserId;
  if (resolvedUserId !== undefined) {
    out.userId = resolvedUserId;
  }

  // teamId: state 우선 → config 폴백.
  const stateTeamId =
    typeof state.teamId === 'string' && state.teamId.trim() !== ''
      ? (state.teamId as TeamId)
      : undefined;
  const configTeamId =
    typeof configurable?.teamId === 'string' &&
    configurable.teamId.trim() !== ''
      ? (configurable.teamId as TeamId)
      : undefined;
  const resolvedTeamId = stateTeamId ?? configTeamId;
  if (resolvedTeamId !== undefined) {
    out.teamId = resolvedTeamId;
  }

  return out;
}

export function normalizer(
  state: CoreGraphState,
  config?: RunnableConfig,
): CoreGraphUpdate {
  // 이번 턴의 입력 = messages 의 "마지막 Human 메시지" (CopilotKit 라운드트립).
  // ⚠️ userMessage 채널은 thread checkpoint 에 last-write-wins 로 persist 되므로
  //   이전 턴의 값을 신뢰하면 멀티턴에서 intent 가 첫 메시지로 고정된다
  //   (예: "안녕"(chat) 다음 "스코어" 질의가 chat 으로 오인 → score 카드 미렌더).
  //   따라서 매 run 마지막 Human 메시지에서 원문을 다시 추출한다.
  const lastHuman = [...state.messages].reverse().find(isHumanMessage);
  const raw =
    lastHuman !== undefined
      ? messageText(lastHuman)
      : (state.userMessage ?? '');

  // 신원 해석(config.configurable → state 승격, state 값은 보존). 그래프 진입 1회.
  const identity = resolveIdentity(state, config);

  return {
    userMessage: raw,
    userMessageDisplay: toDisplayForm(raw),
    userMessageNormalized: toNormalizedForm(raw),
    ...identity,
  };
}
