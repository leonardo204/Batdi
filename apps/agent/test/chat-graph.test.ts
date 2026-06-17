/**
 * ChatGraph 서비스 테스트 (P3-W8 8.1, SSOT §9.1 / §6.3)
 *
 * generateChatReply 의 4가지 경로를 결정론적으로 검증한다:
 *  - 키 없음 → 팀톤 캔드(스켈레톤 stub 아님)
 *  - 키 있음 + 정상 응답 → 통과(trim)
 *  - 키 있음 + 비속어 응답 → 출력 가드레일이 캔드로 교체
 *  - 키 있음 + invoke throw → 캔드 폴백(throw 금지)
 *
 * LLM 호출은 @langchain/google-genai 를 **class 로 모킹**한다(CJS↔ESM interop 에서
 * vi.fn(()=>({}))는 new 가 "not a constructor" 로 실패 — semantic-guardrail.test.ts 참고).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateChatReply,
  applyOutputGuardrail,
} from '../src/services/chat-graph';
import { cannedReactionFor } from '../src/utils/prompt-builder';
import type { CoreGraphState } from '../src/state';

// ── @langchain/google-genai 모킹: invoke 반환을 테스트별로 제어 ──
const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class {
    invoke = mockInvoke;
  },
}));

/** chat 경로 최소 state */
function makeState(
  userMessage: string,
  teamId?: CoreGraphState['teamId'],
): CoreGraphState {
  return {
    messages: [{ role: 'user', content: userMessage }],
    userMessage,
    userMessageDisplay: userMessage,
    userMessageNormalized: userMessage,
    intent: 'chat',
    teamId,
  } as unknown as CoreGraphState;
}

const ORIGINAL_KEY = process.env.GOOGLE_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.GOOGLE_API_KEY;
  } else {
    process.env.GOOGLE_API_KEY = ORIGINAL_KEY;
  }
  mockInvoke.mockReset();
});

describe('applyOutputGuardrail — 출력 재검증 (§6.3)', () => {
  it('정상 텍스트는 trim 후 통과', () => {
    expect(applyOutputGuardrail('  롯데 화이팅!  ', 'lotte')).toBe(
      '롯데 화이팅!',
    );
  });

  it('빈 응답 → 팀톤 캔드 폴백', () => {
    expect(applyOutputGuardrail('   ', 'doosan')).toBe(
      cannedReactionFor('doosan'),
    );
  });

  it('비속어 검출 → 안전 캔드로 교체(LLM 재호출 없음)', () => {
    const out = applyOutputGuardrail('이런 씨발 짜증나네', 'kia');
    expect(out).toBe(cannedReactionFor('kia'));
    expect(out).not.toContain('씨발');
  });
});

describe('generateChatReply — chat 응답 생성', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('GOOGLE_API_KEY 없음 → 팀톤 캔드(스켈레톤 stub 아님)', async () => {
    delete process.env.GOOGLE_API_KEY;
    const out = await generateChatReply(makeState('안녕', 'hanwha'));
    expect(out).toBe(cannedReactionFor('hanwha'));
    expect(out).not.toContain('스켈레톤');
    // 키 없으면 LLM 호출하지 않는다.
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('키 없음 + teamId 미지정 → hanwha 캔드 폴백', async () => {
    delete process.env.GOOGLE_API_KEY;
    const out = await generateChatReply(makeState('안녕'));
    expect(out).toBe(cannedReactionFor(undefined));
    expect(out).not.toContain('스켈레톤');
  });

  it('키 있음 + 정상 응답 → 응답 통과(trim)', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '  오늘 경기 기대되네유~  ' });
    const out = await generateChatReply(makeState('오늘 야구 어때', 'hanwha'));
    expect(out).toBe('오늘 경기 기대되네유~');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('키 있음 + 비속어 응답 → 출력 가드레일이 팀톤 캔드로 교체', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '씨발 몰라' });
    const out = await generateChatReply(makeState('욕해봐', 'lotte'));
    expect(out).toBe(cannedReactionFor('lotte'));
    expect(out).not.toContain('씨발');
  });

  it('키 있음 + invoke throw → 팀톤 캔드 폴백(throw 금지)', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockRejectedValue(new Error('LLM down'));
    const out = await generateChatReply(makeState('안녕', 'kia'));
    expect(out).toBe(cannedReactionFor('kia'));
  });

  it('키 있음 + 빈 응답 → 팀톤 캔드 폴백', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '   ' });
    const out = await generateChatReply(makeState('안녕', 'doosan'));
    expect(out).toBe(cannedReactionFor('doosan'));
  });
});
