/**
 * Memory 서비스 테스트 (P3-W9 9.2 — 3단계 대화 컨텍스트 메모리)
 *
 * 검증:
 *  - selectWorkingMemory: 순수 분리(25→20+5, 10→10+0). 모킹 불필요.
 *  - summarizeOverflow: 키 없음/overflow 빈 배열 → prevSummary 그대로. 키+overflow → 요약 텍스트.
 *  - buildConversationMemory: overflow 0 → sessionSummary=prevSessionSummary, count=메시지수.
 *  - buildConversationMemoryBlock: 비어있으면 '', session/long-term 있으면 하위 태그.
 *
 * LLM 호출은 @langchain/google-genai 를 **class 모킹**(l3-composer.test.ts 패턴)으로
 * 결정론적으로 검증한다. CJS↔ESM interop 에서 `new` 가능하도록 class 로 모킹.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import {
  WORKING_MEMORY_LIMIT,
  selectWorkingMemory,
  summarizeOverflow,
  buildConversationMemory,
} from '../src/services/memory';
import { buildConversationMemoryBlock } from '../src/utils/prompt-builder';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class {
    invoke = mockInvoke;
  },
}));

/** n개의 더미 메시지(번호가 매겨진 Human/AI 교차) */
function makeMessages(n: number): BaseMessage[] {
  const list: BaseMessage[] = [];
  for (let i = 0; i < n; i += 1) {
    list.push(
      i % 2 === 0 ? new HumanMessage(`u${i}`) : new AIMessage(`a${i}`),
    );
  }
  return list;
}

describe('selectWorkingMemory', () => {
  it('25개 → working 20 + overflow 5 (최근이 working)', () => {
    const { working, overflow } = selectWorkingMemory(makeMessages(25));
    expect(working).toHaveLength(WORKING_MEMORY_LIMIT);
    expect(overflow).toHaveLength(5);
    // overflow 는 가장 오래된 5개(0~4), working 은 최근 20개(5~24). 24는 짝수=Human(u24).
    expect((overflow[0] as HumanMessage).content).toBe('u0');
    expect((working[working.length - 1] as HumanMessage).content).toBe('u24');
  });

  it('10개 → working 10 + overflow 0 (상한 이하)', () => {
    const { working, overflow } = selectWorkingMemory(makeMessages(10));
    expect(working).toHaveLength(10);
    expect(overflow).toHaveLength(0);
  });

  it('정확히 상한(20개) → overflow 0', () => {
    const { working, overflow } = selectWorkingMemory(
      makeMessages(WORKING_MEMORY_LIMIT),
    );
    expect(working).toHaveLength(WORKING_MEMORY_LIMIT);
    expect(overflow).toHaveLength(0);
  });
});

describe('summarizeOverflow', () => {
  const prevKey = process.env.GOOGLE_API_KEY;
  beforeEach(() => {
    mockInvoke.mockReset();
  });
  afterEach(() => {
    if (prevKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = prevKey;
  });

  it('overflow 빈 배열 → prevSummary 그대로 (LLM 미호출)', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    const out = await summarizeOverflow([], '이전 요약', undefined);
    expect(out).toBe('이전 요약');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('키 없음 → prevSummary 그대로 (LLM 미호출, throw 금지)', async () => {
    delete process.env.GOOGLE_API_KEY;
    const out = await summarizeOverflow(makeMessages(3), '이전 요약', undefined);
    expect(out).toBe('이전 요약');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('키 + overflow → 갱신 요약 텍스트 반환', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '  롯데 팬, 박세웅 관심.  ' });
    const out = await summarizeOverflow(makeMessages(3), null, undefined);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(out).toBe('롯데 팬, 박세웅 관심.'); // trim
  });

  it('빈 응답 → prevSummary 유지', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '   ' });
    const out = await summarizeOverflow(makeMessages(3), '이전', undefined);
    expect(out).toBe('이전');
  });

  it('LLM throw → prevSummary 유지(전파 안 함)', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockRejectedValue(new Error('network'));
    const out = await summarizeOverflow(makeMessages(3), '이전', undefined);
    expect(out).toBe('이전');
  });
});

describe('buildConversationMemory', () => {
  const prevKey = process.env.GOOGLE_API_KEY;
  beforeEach(() => {
    mockInvoke.mockReset();
  });
  afterEach(() => {
    if (prevKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = prevKey;
  });

  it('메시지 10개(overflow 0) → sessionSummary=prev, count=10, LLM 미호출', async () => {
    const memory = await buildConversationMemory({
      messages: makeMessages(10),
      prevSessionSummary: '직전 요약',
      longTermSummary: '장기 프로필',
    });
    expect(memory.workingMessageCount).toBe(10);
    expect(memory.sessionSummary).toBe('직전 요약');
    expect(memory.longTermSummary).toBe('장기 프로필');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('메시지 25개(overflow 5) + 키 → 요약 갱신, count=20', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '갱신된 세션 요약' });
    const memory = await buildConversationMemory({
      messages: makeMessages(25),
      prevSessionSummary: null,
      longTermSummary: null,
    });
    expect(memory.workingMessageCount).toBe(WORKING_MEMORY_LIMIT);
    expect(memory.sessionSummary).toBe('갱신된 세션 요약');
    expect(memory.longTermSummary).toBeNull();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});

describe('buildConversationMemoryBlock', () => {
  it('memory undefined / 둘 다 비어있으면 빈 문자열', () => {
    expect(buildConversationMemoryBlock(undefined)).toBe('');
    expect(
      buildConversationMemoryBlock({
        workingMessageCount: 5,
        sessionSummary: null,
        longTermSummary: null,
      }),
    ).toBe('');
    expect(
      buildConversationMemoryBlock({
        workingMessageCount: 5,
        sessionSummary: '   ',
        longTermSummary: '',
      }),
    ).toBe('');
  });

  it('session 요약만 있으면 session_summary 태그만', () => {
    const block = buildConversationMemoryBlock({
      workingMessageCount: 20,
      sessionSummary: '롯데 팬',
      longTermSummary: null,
    });
    expect(block).toContain('<conversation_memory priority="3">');
    expect(block).toContain('<session_summary>롯데 팬</session_summary>');
    expect(block).not.toContain('<long_term_profile>');
    expect(block.endsWith('\n\n')).toBe(true);
  });

  it('long-term 요약만 있으면 long_term_profile 태그만', () => {
    const block = buildConversationMemoryBlock({
      workingMessageCount: 5,
      sessionSummary: null,
      longTermSummary: '입문자, 친근한 말투 선호',
    });
    expect(block).toContain(
      '<long_term_profile>입문자, 친근한 말투 선호</long_term_profile>',
    );
    expect(block).not.toContain('<session_summary>');
  });

  it('둘 다 있으면 두 태그 모두', () => {
    const block = buildConversationMemoryBlock({
      workingMessageCount: 20,
      sessionSummary: '세션',
      longTermSummary: '장기',
    });
    expect(block).toContain('<session_summary>세션</session_summary>');
    expect(block).toContain('<long_term_profile>장기</long_term_profile>');
  });
});
