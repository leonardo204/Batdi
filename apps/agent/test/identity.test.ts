/**
 * Identity 배선 테스트 (P3-W9 9.3 신원 배선)
 *
 * 검증 대상:
 *  - normalizer 가 2번째 인자 config.configurable.userId/teamId 를 state 로 승격한다.
 *  - state 에 이미 값이 있으면(테스트 invoke) config 가 있어도 보존한다(덮어쓰지 않음).
 *  - 둘 다 없으면 해당 필드를 반환하지 않아 익명 기본값을 유지한다.
 *  - resolveThreadId 가 config.configurable.thread_id → threadId 우선순위로 추출한다.
 *
 * 전달 채널(조사 결론): 프론트 properties.config.configurable → @ag-ui/langgraph 가
 *   RunsStreamPayload.config 로 보존 → 노드 2번째 인자 config.configurable.
 */
import { describe, it, expect } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { normalizer } from '../src/nodes/normalizer';
import { resolveThreadId } from '../src/utils/identity';
import type { CoreGraphState } from '../src/state';

/** 최소 state 헬퍼 — normalizer 가 읽는 필드만 채운다. */
function makeState(partial: Partial<CoreGraphState>): CoreGraphState {
  return {
    messages: [new HumanMessage('롯데 스코어')],
    ...partial,
  } as CoreGraphState;
}

describe('normalizer identity 승격', () => {
  it('config.configurable.userId/teamId 를 state 로 승격(state 비어있을 때)', () => {
    const config: RunnableConfig = {
      configurable: { userId: 'user-cfg', teamId: 'lotte' },
    };
    const out = normalizer(makeState({}), config);
    expect(out.userId).toBe('user-cfg');
    expect(out.teamId).toBe('lotte');
  });

  it('state 에 값이 있으면 config 가 있어도 state 값 보존(덮어쓰지 않음)', () => {
    const config: RunnableConfig = {
      configurable: { userId: 'user-cfg', teamId: 'lotte' },
    };
    const out = normalizer(
      makeState({ userId: 'user-state', teamId: 'doosan' }),
      config,
    );
    expect(out.userId).toBe('user-state');
    expect(out.teamId).toBe('doosan');
  });

  it('config 없고 state 도 없으면 userId/teamId 반환 안 함(익명 유지)', () => {
    const out = normalizer(makeState({}), undefined);
    expect(out.userId).toBeUndefined();
    expect(out.teamId).toBeUndefined();
  });

  it('config.configurable 빈 값/공백은 무시(승격 안 함)', () => {
    const config: RunnableConfig = {
      configurable: { userId: '   ', teamId: '' },
    };
    const out = normalizer(makeState({}), config);
    expect(out.userId).toBeUndefined();
    expect(out.teamId).toBeUndefined();
  });

  it('normalizer 는 userMessage 3-form 도 항상 채운다(회귀 없음)', () => {
    const out = normalizer(makeState({}), undefined);
    expect(out.userMessage).toBe('롯데 스코어');
    expect(typeof out.userMessageNormalized).toBe('string');
    expect(typeof out.userMessageDisplay).toBe('string');
  });
});

describe('resolveThreadId', () => {
  it('config.configurable.thread_id(snake) 추출', () => {
    const config: RunnableConfig = {
      configurable: { thread_id: 'thread-snake' },
    };
    expect(resolveThreadId(config)).toBe('thread-snake');
  });

  it('thread_id 없으면 threadId(camel) 폴백', () => {
    const config: RunnableConfig = {
      configurable: { threadId: 'thread-camel' },
    };
    expect(resolveThreadId(config)).toBe('thread-camel');
  });

  it('snake 우선(둘 다 있으면 thread_id)', () => {
    const config: RunnableConfig = {
      configurable: { thread_id: 'snake', threadId: 'camel' },
    };
    expect(resolveThreadId(config)).toBe('snake');
  });

  it('config 없으면 undefined', () => {
    expect(resolveThreadId(undefined)).toBeUndefined();
  });

  it('빈/공백 thread_id 는 undefined', () => {
    const config: RunnableConfig = { configurable: { thread_id: '  ' } };
    expect(resolveThreadId(config)).toBeUndefined();
  });
});
