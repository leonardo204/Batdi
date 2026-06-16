/**
 * OutputGuardrail 노드 테스트 (P2-W6, 6.6)
 *
 * SSOT: Ref-docs/specs/design/batdi-persona-guardrail.md §6.3
 *   - 수치 팩트체크(아라비아 숫자 차단) / 일베·비속어 출력 재검증 / undefined 스킵.
 */
import { describe, it, expect } from 'vitest';
import { outputGuardrail } from '../src/nodes/output-guardrail';
import type { CoreGraphState } from '../src/state';

/** reaction 만 세팅한 최소 score state */
function makeState(reaction: string | undefined): CoreGraphState {
  return {
    messages: [],
    userMessage: '오늘 경기 어때?',
    userMessageNormalized: '오늘경기어때',
    userMessageDisplay: '오늘 경기 어때?',
    userId: 'u1',
    teamId: 'hanwha',
    inputGuardrailResult: { pass: true },
    outputGuardrailResult: undefined,
    intent: 'score',
    intentConfidence: 'high',
    complexity: 'simple',
    cacheHit: 'miss',
    reaction,
    a2uiEnvelope: undefined,
    llmCallCount: undefined,
    traceId: undefined,
  } as unknown as CoreGraphState;
}

describe('outputGuardrail — 수치 팩트체크', () => {
  it('아라비아 숫자 포함 리액션("롯데 5점 앞서유") → 캔드 교체 + pass:false 기록', () => {
    const update = outputGuardrail(makeState('롯데 5점 앞서유'));
    expect(update.outputGuardrailResult?.pass).toBe(false);
    expect(update.outputGuardrailResult?.violationType).toBe(
      'numeric_hallucination',
    );
    // 교체된 리액션엔 숫자가 없어야 한다.
    expect(update.reaction).toBeDefined();
    expect(update.reaction).not.toMatch(/[0-9]/);
  });

  it('숫자 없는 정상 리액션("화이팅이여!") → 그대로 통과', () => {
    const update = outputGuardrail(makeState('화이팅이여!'));
    expect(update.outputGuardrailResult?.pass).toBe(true);
    expect(update.reaction).toBe('화이팅이여!');
  });
});

describe('outputGuardrail — 일베/비속어 출력 재검증', () => {
  it('일베 표현이 새어나온 리액션 → 안전 캔드로 교체 + pass:false', () => {
    const update = outputGuardrail(makeState('운지 화이팅이여'));
    expect(update.outputGuardrailResult?.pass).toBe(false);
    expect(update.outputGuardrailResult?.violationType).toBe('ilbe_expression');
    expect(update.reaction).toBeDefined();
    expect(update.reaction).not.toContain('운지');
    expect(update.reaction).not.toMatch(/[0-9]/);
  });

  it('비속어가 새어나온 리액션 → 안전 캔드로 교체 + pass:false', () => {
    const update = outputGuardrail(makeState('시발 화이팅'));
    expect(update.outputGuardrailResult?.pass).toBe(false);
    expect(update.outputGuardrailResult?.violationType).toBe('profanity');
    expect(update.reaction).not.toContain('시발');
  });
});

describe('outputGuardrail — reaction undefined 스킵', () => {
  it('reaction 미설정(score 외 경로) → 검사 스킵, pass:true, reaction 미변경', () => {
    const update = outputGuardrail(makeState(undefined));
    expect(update.outputGuardrailResult?.pass).toBe(true);
    // undefined 경로는 reaction 을 손대지 않는다(키 미포함).
    expect(update.reaction).toBeUndefined();
  });
});
