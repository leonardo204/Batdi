/**
 * Normalizer 노드 — userMessage → normalized/display form
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.3 (입력 정규화 3-form)
 *
 *  - userMessage          : 원문 그대로 (LLM 전달·저장용) — 변경 안 함
 *  - userMessageDisplay   : NFKC만 적용 (화면 표시용)
 *  - userMessageNormalized: NFKC + 공백/zero-width/이모지·구분자 제거 +
 *                           반복 문자 축소 + homoglyph 치환 + 소문자
 *                           (필터 매칭용, 사용자 노출 금지)
 *
 * SSOT: Ref-docs/specs/design/batdi-persona-guardrail.md §6.2 Normalizer
 *   "NFKC → 공백·zero-width 제거 → 이모지·구분자 제거 → 반복 문자 축소
 *    → 한글 자모 재조합 → homoglyph 치환"
 *
 * ⚠️ 한글 자모 재조합(decomposed Hangul)은 완전 구현이 까다로워(중성/종성 결합 규칙)
 *   본 단계에서는 미수행한다. 대신 분리된 자모 시퀀스(예: 초성 `ㄴㅁㅎ`)를 normalized
 *   에 **그대로 보존**하여, 필터가 초성 패턴으로 직접 매칭하도록 한다(자모는 구분자
 *   제거 대상이 아니다). 완전 재조합은 추후 보강 대상으로 남긴다.
 */
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import type { TeamId } from '@batdi/types';
import { messageText } from '../utils/message-text';

/** zero-width 문자 (ZWSP/ZWNJ/ZWJ/BOM) */
const ZERO_WIDTH = /[​-‍﻿]/g;
/** 이모지 (확장 픽토그래픽 + 변이 셀렉터) */
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;
/** 연속 공백 */
const MULTI_SPACE = /\s+/g;

/**
 * 글자 사이에 끼워 넣어 우회하는 구분자 (예: `노_무현`, `노-무-현`, `노.무.현`).
 * ⚠️ 자모(ㄱ-ㅎ, ㅏ-ㅣ)는 매칭 신호이므로 제거하지 않는다. 공백은 별도 처리.
 */
const SEPARATORS = /[_\-.·*~`'"|/\\#@^=+·•・･]/g;

/**
 * homoglyph(유사 문자) 최소 매핑 테이블 — 라틴/키릴 등으로 한글·숫자를 흉내내는 우회 차단.
 * 작은 테이블로 시작(자주 쓰이는 전각/유사 알파벳·숫자 위주). NFKC 이후 잔존분만 처리.
 * 키는 소문자화 이전 기준이 아니라 매핑 후 toLowerCase 로 통일된다.
 */
const HOMOGLYPH: Record<string, string> = {
  // 키릴 → 라틴 (외형 동일)
  а: 'a',
  е: 'e',
  о: 'o',
  с: 'c',
  р: 'p',
  х: 'x',
  у: 'y',
  к: 'k',
  м: 'm',
  т: 't',
  // 숫자 유사 (leet) → 알파벳
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
};

/** 글자 단위 homoglyph 치환 */
function replaceHomoglyphs(input: string): string {
  let out = '';
  for (const ch of input) {
    out += HOMOGLYPH[ch] ?? ch;
  }
  return out;
}

/**
 * 한글 conjoining 자모(NFKC 산출물) → compatibility 자모 복원.
 *
 * NFKC 는 호환 자모(ㄱ U+3131, ㅋ U+314B 등)를 조합용 자모(초성 U+1100~, 중성 U+1161~)로
 * 정규화한다. 이 때문에 사용자가 친 `ㄴㅁㅎ`(호환)가 `ᄂᄆᄒ`(조합용)로 바뀌어
 * 필터의 호환-자모 패턴(`/ㄴㅁㅎ/`)이 매칭되지 않는다.
 * 자주 쓰이는 초성 조합용 자모를 호환 자모로 되돌려, 분리 자모 시퀀스를 매칭 가능하게 한다.
 * (중성/종성은 일베 초성 밈에 거의 안 쓰여 초성만 최소 매핑.)
 */
const CHOSEONG_TO_COMPAT: Record<string, string> = {
  'ᄀ': 'ㄱ',
  'ᄁ': 'ㄲ',
  'ᄂ': 'ㄴ',
  'ᄃ': 'ㄷ',
  'ᄄ': 'ㄸ',
  'ᄅ': 'ㄹ',
  'ᄆ': 'ㅁ',
  'ᄇ': 'ㅂ',
  'ᄈ': 'ㅃ',
  'ᄉ': 'ㅅ',
  'ᄊ': 'ㅆ',
  'ᄋ': 'ㅇ',
  'ᄌ': 'ㅈ',
  'ᄍ': 'ㅉ',
  'ᄎ': 'ㅊ',
  'ᄏ': 'ㅋ',
  'ᄐ': 'ㅌ',
  'ᄑ': 'ㅍ',
  'ᄒ': 'ㅎ',
};

/** 조합용 초성 자모를 호환 자모로 복원 */
function restoreCompatJamo(input: string): string {
  let out = '';
  for (const ch of input) {
    out += CHOSEONG_TO_COMPAT[ch] ?? ch;
  }
  return out;
}

/**
 * 반복 문자 축소 — 동일 문자 3회 이상 연속을 2회로 축약.
 * (예: `ㅋㅋㅋㅋ`→`ㅋㅋ`, `노오오오무현`→`노오무현`, `씨이이발`→`씨이발`)
 * 2회까지는 보존하여 정상어(예: `빠빠`)·이중모음 우회 매칭 여지를 남긴다.
 */
function collapseRepeats(input: string): string {
  return input.replace(/(.)\1{2,}/gu, '$1$1');
}

/** 표시용 정규화 — NFKC만 */
export function toDisplayForm(raw: string): string {
  return raw.normalize('NFKC');
}

/**
 * 매칭용 정규화 — SSOT §6.2 Normalizer 파이프라인.
 * NFKC → zero-width 제거 → 이모지 제거 → 구분자 제거 → 공백 제거
 * → 반복 문자 축소 → homoglyph 치환 → 소문자.
 *
 * ⚠️ 매칭 전용. 공백까지 제거하므로 `노 무 현` 같은 띄어쓰기 우회도 흡수된다.
 *   (단어 경계 기반 패턴이 아닌 substring 패턴을 쓰는 IlbeMimFilter 전제)
 */
export function toNormalizedForm(raw: string): string {
  const collapsed = collapseRepeats(
    raw
      .normalize('NFKC')
      .replace(ZERO_WIDTH, '')
      .replace(EMOJI, '')
      .replace(SEPARATORS, '')
      .replace(MULTI_SPACE, ''),
  );
  return restoreCompatJamo(replaceHomoglyphs(collapsed)).trim().toLowerCase();
}

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
