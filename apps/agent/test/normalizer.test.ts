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
import { normalizer } from '../src/nodes/normalizer';
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
    expect(out.userMessageNormalized).toBe('오늘 롯데 경기 스코어');
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
