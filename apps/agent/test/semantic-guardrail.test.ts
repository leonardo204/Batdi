/**
 * SemanticGuardrail 노드 테스트 (P2-W4.3, SSOT §6.2-E)
 *
 * 2단계 의미 가드레일: 1단계(rule-based) 통과 + 의심 신호 있을 때만 Flash-Lite 호출.
 *  - 의심 게이트(hasSuspicionSignal) 정확도(우회 신호 감지 / 정상어 오탐 최소)
 *  - 노드 동작: 이미 차단됨 / 신호 없음 / 키 없음(fail-open) / LLM unsafe·safe·오류
 *
 * LLM 호출은 @langchain/google-genai 를 모킹해 결정론적으로 검증한다(실 호출 금지).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hasSuspicionSignal,
  semanticGuardrail,
  SEMANTIC_FALLBACK,
} from '../src/nodes/semantic-guardrail';
import { toNormalizedForm } from '../src/nodes/normalizer';
import type { CoreGraphState } from '../src/state';

// ── @langchain/google-genai 모킹: invoke 반환을 테스트별로 제어 ──
// ⚠️ 패키지가 CJS 라 ESM↔CJS interop 시 `vi.fn(()=>({...}))` 의 화살표 구현이
//   소스 쪽 import 에 그대로 노출되어 `new` 가 "not a constructor" 로 실패한다.
//   모든 interop 모드에서 생성 가능한 **class** 로 모킹한다.
const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class {
    invoke = mockInvoke;
  },
}));

/** display/normalized 를 원문에서 채운 최소 state */
function makeState(raw: string, pass = true): CoreGraphState {
  return {
    messages: [],
    userMessage: raw,
    userMessageDisplay: raw,
    userMessageNormalized: toNormalizedForm(raw),
    inputGuardrailResult: { pass },
  } as unknown as CoreGraphState;
}

describe('hasSuspicionSignal — LLM 호출 게이트', () => {
  it('위협 우회 신호를 감지한다', () => {
    expect(hasSuspicionSignal(toNormalizedForm('집에 찾아가서 혼내줄까'))).toBe(
      true,
    );
    expect(hasSuspicionSignal(toNormalizedForm('가만 안 둬'))).toBe(true);
    expect(hasSuspicionSignal(toNormalizedForm('두고 봐라'))).toBe(true);
  });

  it('비하 우회 신호를 감지한다', () => {
    expect(hasSuspicionSignal(toNormalizedForm('저 팀 팬들 수준 보소'))).toBe(
      true,
    );
    expect(hasSuspicionSignal(toNormalizedForm('걔네 다 그런 부류지'))).toBe(
      true,
    );
  });

  it('정상 야구 질의는 신호 없음(LLM 미호출)', () => {
    expect(hasSuspicionSignal(toNormalizedForm('오늘 롯데 경기 스코어'))).toBe(
      false,
    );
    expect(hasSuspicionSignal(toNormalizedForm('문동주 ERA 알려줘'))).toBe(
      false,
    );
    expect(hasSuspicionSignal(toNormalizedForm('지금 몇 대 몇이야'))).toBe(false);
  });

  it('빈 입력은 신호 없음', () => {
    expect(hasSuspicionSignal('')).toBe(false);
  });
});

describe('semanticGuardrail 노드', () => {
  const prevKey = process.env.GOOGLE_API_KEY;
  beforeEach(() => {
    mockInvoke.mockReset();
  });
  afterEach(() => {
    if (prevKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = prevKey;
  });

  it('1단계에서 이미 차단됐으면 LLM 미호출, {} 반환', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    const out = await semanticGuardrail(makeState('집에 찾아가서 혼내줄까', false));
    expect(out).toEqual({});
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('의심 신호 없으면 LLM 미호출, {} 반환(통과)', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    const out = await semanticGuardrail(makeState('오늘 롯데 경기 스코어'));
    expect(out).toEqual({});
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('의심 신호 있으나 키 없음 → fail-open({}), LLM 미호출', async () => {
    delete process.env.GOOGLE_API_KEY;
    const out = await semanticGuardrail(makeState('집에 찾아가서 혼내줄까'));
    expect(out).toEqual({});
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('의심 신호 + LLM unsafe → 차단(semantic_ violationType + fallback)', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({
      content: '{"safe": false, "reason": "threat"}',
    });
    const out = await semanticGuardrail(makeState('집에 찾아가서 혼내줄까'));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(out.inputGuardrailResult?.pass).toBe(false);
    expect(out.inputGuardrailResult?.violationType).toBe('semantic_threat');
    expect(out.inputGuardrailResult?.fallbackResponse).toBe(SEMANTIC_FALLBACK);
  });

  it('의심 신호 + LLM safe → 통과({})', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({
      content: '{"safe": true, "reason": "정상 경기 평가"}',
    });
    // "수준" 신호에 걸리지만 맥락상 정상(수준 높은 경기)
    const out = await semanticGuardrail(makeState('오늘 경기 수준 진짜 높더라'));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(out).toEqual({});
  });

  it('LLM 오류 → fail-open({})', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockRejectedValue(new Error('network'));
    const out = await semanticGuardrail(makeState('집에 찾아가서 혼내줄까'));
    expect(out).toEqual({});
  });

  it('파싱 불가 응답 → fail-open({})', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '음... 잘 모르겠어요' });
    const out = await semanticGuardrail(makeState('집에 찾아가서 혼내줄까'));
    expect(out).toEqual({});
  });

  it('코드펜스로 감싼 JSON 도 파싱해 차단한다', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({
      content: '```json\n{"safe": false, "reason": "insult"}\n```',
    });
    const out = await semanticGuardrail(makeState('걔네 다 그런 부류지'));
    expect(out.inputGuardrailResult?.pass).toBe(false);
    expect(out.inputGuardrailResult?.violationType).toBe('semantic_insult');
  });
});
