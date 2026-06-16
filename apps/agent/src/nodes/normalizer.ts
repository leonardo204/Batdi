/**
 * Normalizer 노드 — userMessage → normalized/display form
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.3 (입력 정규화 3-form)
 *
 *  - userMessage          : 원문 그대로 (LLM 전달·저장용) — 변경 안 함
 *  - userMessageDisplay   : NFKC만 적용 (화면 표시용)
 *  - userMessageNormalized: NFKC + 공백/zero-width/이모지 제거 + 소문자
 *                           (필터 매칭용, 사용자 노출 금지)
 *
 * TODO(W4): 자모 재조합(decomposed Hangul) + homoglyph 치환은 다음 단계에서 보강.
 */
import type { BaseMessage } from '@langchain/core/messages';
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import { messageText } from '../utils/message-text';

/** zero-width 문자 (ZWSP/ZWNJ/ZWJ/BOM) */
const ZERO_WIDTH = /[​-‍﻿]/g;
/** 이모지 (확장 픽토그래픽 + 변이 셀렉터) */
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;
/** 연속 공백 */
const MULTI_SPACE = /\s+/g;

/** 표시용 정규화 — NFKC만 */
export function toDisplayForm(raw: string): string {
  return raw.normalize('NFKC');
}

/** 매칭용 정규화 — NFKC + zero-width/이모지 제거 + 공백 축약 + 소문자 */
export function toNormalizedForm(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(EMOJI, '')
    .replace(MULTI_SPACE, ' ')
    .trim()
    .toLowerCase();
}

/** BaseMessage 가 Human(사용자) 메시지인지 */
function isHumanMessage(message: BaseMessage): boolean {
  return message.getType() === 'human';
}

export function normalizer(state: CoreGraphState): CoreGraphUpdate {
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

  return {
    userMessage: raw,
    userMessageDisplay: toDisplayForm(raw),
    userMessageNormalized: toNormalizedForm(raw),
  };
}
