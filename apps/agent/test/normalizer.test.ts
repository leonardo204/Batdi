/**
 * Normalizer 노드 테스트
 *
 * 핵심 회귀 방지(ADR-021 원인 C): userMessage 채널은 thread checkpoint 에
 * last-write-wins 로 persist 되므로, normalizer 는 이전 턴 값이 아니라
 * **매 run messages 의 마지막 Human 메시지**에서 원문을 재추출해야 한다.
 * (안 그러면 멀티턴 2번째 질의의 intent 가 첫 메시지로 고정됨)
 */
import { describe, it, expect } from 'vitest';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { normalizer, toNormalizedForm } from '../src/nodes/normalizer';
import type { CoreGraphState } from '../src/state';

/** 최소 state 헬퍼 (테스트 대상 필드만) */
function makeState(partial: Partial<CoreGraphState>): CoreGraphState {
  return { messages: [], userMessage: '', ...partial } as CoreGraphState;
}

describe('normalizer', () => {
  it('단일 Human 메시지의 원문을 추출한다', () => {
    const out = normalizer(
      makeState({ messages: [new HumanMessage('오늘 롯데 경기 스코어')] }),
    );
    expect(out.userMessage).toBe('오늘 롯데 경기 스코어');
    // 매칭 정규화는 공백을 제거한다(띄어쓰기 우회 흡수). display/원문은 보존.
    expect(out.userMessageNormalized).toBe('오늘롯데경기스코어');
    expect(out.userMessageDisplay).toBe('오늘 롯데 경기 스코어');
  });

  it('멀티턴: checkpoint persist 된 userMessage 를 무시하고 마지막 Human 메시지를 쓴다', () => {
    // 이전 턴 userMessage("안녕")가 persist 된 상태 + messages 에 새 질의가 추가됨
    const out = normalizer(
      makeState({
        userMessage: '안녕',
        messages: [
          new HumanMessage('안녕'),
          new AIMessage('안녕!'),
          new HumanMessage('오늘 롯데 두산 스코어 알려줘'),
        ],
      }),
    );
    expect(out.userMessage).toBe('오늘 롯데 두산 스코어 알려줘');
  });

  it('마지막이 AI 메시지여도 마지막 Human 메시지를 찾는다', () => {
    const out = normalizer(
      makeState({
        messages: [
          new HumanMessage('스코어'),
          new AIMessage('처리 중…'),
        ],
      }),
    );
    expect(out.userMessage).toBe('스코어');
  });

  it('Human 메시지가 없으면 persist 된 userMessage 로 폴백한다', () => {
    const out = normalizer(
      makeState({ userMessage: '폴백', messages: [new AIMessage('hi')] }),
    );
    expect(out.userMessage).toBe('폴백');
  });
});

describe('toNormalizedForm (W4 매칭 정규화 보강)', () => {
  it('구분자(_-.·*)를 제거한다', () => {
    expect(toNormalizedForm('노_무_현')).toBe('노무현');
    expect(toNormalizedForm('노-무-현')).toBe('노무현');
    expect(toNormalizedForm('노.무.현')).toBe('노무현');
    expect(toNormalizedForm('노·무·현')).toBe('노무현');
  });

  it('공백을 제거해 띄어쓰기 우회를 흡수한다', () => {
    expect(toNormalizedForm('노 무 현')).toBe('노무현');
  });

  it('zero-width/이모지를 제거한다', () => {
    expect(toNormalizedForm('노​무현')).toBe('노무현');
    expect(toNormalizedForm('노🔥무🔥현')).toBe('노무현');
  });

  it('3회 이상 반복 문자를 2회로 축소한다', () => {
    expect(toNormalizedForm('ㅋㅋㅋㅋㅋ')).toBe('ㅋㅋ');
    // 3회 이상 → 2회 (3개 오 → 2개 오)
    expect(toNormalizedForm('노오오오무현')).toBe('노오오무현');
    expect(toNormalizedForm('하하')).toBe('하하'); // 2회는 보존
  });

  it('homoglyph(키릴/숫자 유사문자)를 치환한다', () => {
    // 키릴 а(U+0430) → 라틴 a, 숫자 0 → o, 1 → i
    expect(toNormalizedForm('dаn')).toBe('dan'); // 첫 а는 키릴
    expect(toNormalizedForm('jailbr3ak'.replace('3', '3'))).toContain('jailbreak');
    expect(toNormalizedForm('admin0')).toBe('admino');
  });

  it('초성 시퀀스(ㄴㅁㅎ)는 구분자로 제거하지 않고 보존한다', () => {
    expect(toNormalizedForm('ㄴㅁㅎ')).toBe('ㄴㅁㅎ');
    expect(toNormalizedForm('ㄴ ㅁ ㅎ')).toBe('ㄴㅁㅎ'); // 공백만 제거
  });

  it('정상 야구 문장은 의미를 해치지 않는다(공백만 제거)', () => {
    expect(toNormalizedForm('문동주 ERA 알려줘')).toBe('문동주era알려줘');
  });
});
