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
// bindTools 는 동일 인스턴스를 반환해 bound 모델도 mockInvoke 를 쓰게 한다(tool_call 경로 검증).
const { mockInvoke, mockBindTools } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockBindTools: vi.fn(),
}));
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class {
    invoke = mockInvoke;
    bindTools = (...args: unknown[]) => {
      mockBindTools(...args);
      return this; // bound 모델도 같은 invoke 사용.
    };
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
  mockBindTools.mockReset();
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
    expect(out.text).toBe(cannedReactionFor('hanwha'));
    expect(out.text).not.toContain('스켈레톤');
    expect(out.toolCalls).toEqual([]);
    // 키 없으면 LLM 호출하지 않는다.
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('키 없음 + teamId 미지정 → hanwha 캔드 폴백', async () => {
    delete process.env.GOOGLE_API_KEY;
    const out = await generateChatReply(makeState('안녕'));
    expect(out.text).toBe(cannedReactionFor(undefined));
    expect(out.text).not.toContain('스켈레톤');
  });

  it('키 있음 + 정상 응답 → 응답 통과(trim)', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '  오늘 경기 기대되네유~  ' });
    const out = await generateChatReply(makeState('오늘 야구 어때', 'hanwha'));
    expect(out.text).toBe('오늘 경기 기대되네유~');
    expect(out.toolCalls).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('키 있음 + 비속어 응답 → 출력 가드레일이 팀톤 캔드로 교체', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '씨발 몰라' });
    const out = await generateChatReply(makeState('욕해봐', 'lotte'));
    expect(out.text).toBe(cannedReactionFor('lotte'));
    expect(out.text).not.toContain('씨발');
  });

  it('키 있음 + invoke throw → 팀톤 캔드 폴백(throw 금지)', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockRejectedValue(new Error('LLM down'));
    const out = await generateChatReply(makeState('안녕', 'kia'));
    expect(out.text).toBe(cannedReactionFor('kia'));
  });

  it('키 있음 + 빈 응답 → 팀톤 캔드 폴백', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '   ' });
    const out = await generateChatReply(makeState('안녕', 'doosan'));
    expect(out.text).toBe(cannedReactionFor('doosan'));
  });
});

// ── P4-W10 10.1: 프론트엔드 액션 → tool_call 방출(ADR-050) ──
const REGISTER_ACTION = {
  name: 'registerFavoritePlayer',
  description: '관심 선수 등록',
  parameters: { type: 'object', properties: { playerId: { type: 'number' } } },
};

/** tools 가 주입된 chat state. */
function makeStateWithTools(
  tools: unknown[],
  teamId?: CoreGraphState['teamId'],
): CoreGraphState {
  return {
    messages: [{ role: 'user', content: '한동희 관심 등록해줘' }],
    userMessage: '한동희 관심 등록해줘',
    userMessageDisplay: '한동희 관심 등록해줘',
    userMessageNormalized: '한동희관심등록해줘',
    intent: 'chat',
    teamId,
    tools,
  } as unknown as CoreGraphState;
}

describe('generateChatReply — 프론트엔드 액션 tool_call (ADR-050)', () => {
  beforeEach(() => {
    process.env.GOOGLE_API_KEY = 'test-key';
  });

  it('tool_calls 반환 시 → bindTools + 구조화 toolCalls 반환(name/args 정확)', async () => {
    mockInvoke.mockResolvedValue({
      content: '',
      tool_calls: [
        { id: 'tc-1', name: 'registerFavoritePlayer', args: { playerId: 42 } },
      ],
    });
    const out = await generateChatReply(makeStateWithTools([REGISTER_ACTION], 'lotte'));

    // bindTools 가 function 스키마로 호출됨.
    expect(mockBindTools).toHaveBeenCalledTimes(1);
    const boundArg = mockBindTools.mock.calls[0][0] as Array<{
      type: string;
      function: { name: string };
    }>;
    expect(boundArg[0]).toMatchObject({
      type: 'function',
      function: { name: 'registerFavoritePlayer' },
    });

    // 구조화 toolCalls 1건 — name/args 정확(emit-a2ui 가 AIMessage.toolCalls 로 실음).
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]).toMatchObject({
      id: 'tc-1',
      name: 'registerFavoritePlayer',
      args: { playerId: 42 },
    });

    // LLM 텍스트 없음 → 짧은 확인 문구.
    expect(out.text).toBe('요청 처리할게요!');
  });

  it('tool_calls + LLM 텍스트 있음 → 텍스트 반환(가드레일 통과) + toolCalls 전달', async () => {
    mockInvoke.mockResolvedValue({
      content: '한동희 관심 선수로 등록할게유!',
      tool_calls: [{ name: 'registerFavoritePlayer', args: { playerId: 7 } }],
    });
    const out = await generateChatReply(makeStateWithTools([REGISTER_ACTION], 'lotte'));
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]).toMatchObject({
      name: 'registerFavoritePlayer',
      args: { playerId: 7 },
    });
    expect(out.text).toBe('한동희 관심 선수로 등록할게유!');
  });

  it('tools 있음 + tool_calls 없음 → 텍스트 응답(기존 동작), toolCalls 빈 배열', async () => {
    mockInvoke.mockResolvedValue({ content: '오늘 경기 기대돼유~' });
    const out = await generateChatReply(makeStateWithTools([REGISTER_ACTION], 'lotte'));
    expect(mockBindTools).toHaveBeenCalledTimes(1);
    expect(out.toolCalls).toEqual([]);
    expect(out.text).toBe('오늘 경기 기대돼유~');
  });

  it('actions 없음(tools 미주입) → 기존 동작(bindTools 미호출, toolCalls 빈 배열)', async () => {
    mockInvoke.mockResolvedValue({ content: '반가워유~' });
    const out = await generateChatReply(makeState('안녕', 'lotte'));
    expect(mockBindTools).not.toHaveBeenCalled();
    expect(out.toolCalls).toEqual([]);
    expect(out.text).toBe('반가워유~');
  });
});
