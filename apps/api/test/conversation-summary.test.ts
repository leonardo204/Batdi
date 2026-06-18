/**
 * conversation-summary.test.ts — ConversationSummaryService 유닛 테스트 (P3-W9 9.3).
 *
 * prisma·LLM(@langchain/google-genai) 모킹으로 best-effort 계약을 검증한다(실 DB/네트워크 없음).
 *  - 메시지 없음 → null, LLM 미호출.
 *  - 키 없음 → null, LLM 미호출.
 *  - 정상(LLM 모킹) → summary + summarizedAt update 호출.
 *  - LLM 빈 응답 → null, update 미호출.
 *
 * Gemini 모킹은 agent 테스트(memory.test.ts) 의 class 기반 모킹 패턴을 따른다(CJS↔ESM interop
 *   에서 `new` 가능하도록 class 로 모킹).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class {
    invoke = mockInvoke;
  },
}));

import { ConversationSummaryService } from '../src/conversation/conversation-summary.service';

/** 최소 prisma 모킹 — message.findMany / conversation.update 만. */
function makePrismaMock(messages: { role: string | null; content: string }[]) {
  const findMany = vi.fn().mockResolvedValue(messages);
  const update = vi.fn().mockResolvedValue({});
  const prisma = {
    message: { findMany },
    conversation: { update },
  };
  return { prisma, findMany, update };
}

function makeService(prisma: unknown): ConversationSummaryService {
  // PrismaService 를 직접 주입하는 대신 구조적 호환 객체를 캐스팅(유닛 테스트).
  return new ConversationSummaryService(prisma as never);
}

const SAMPLE_MESSAGES = [
  { role: 'user', content: '롯데 오늘 경기 어때?' },
  { role: 'assistant', content: '롯데 팬이시군요! 같이 응원해요.' },
];

describe('ConversationSummaryService.summarizeConversation', () => {
  const prevKey = process.env.GOOGLE_API_KEY;

  beforeEach(() => {
    mockInvoke.mockReset();
    process.env.GOOGLE_API_KEY = 'test-key';
  });
  afterEach(() => {
    if (prevKey === undefined) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = prevKey;
    }
  });

  it('빈 conversationId → null, LLM/DB 미호출', async () => {
    const { prisma, findMany, update } = makePrismaMock([]);
    const svc = makeService(prisma);

    const result = await svc.summarizeConversation('');
    expect(result).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('메시지 없음 → null, LLM 미호출, update 미호출', async () => {
    const { prisma, findMany, update } = makePrismaMock([]);
    const svc = makeService(prisma);

    const result = await svc.summarizeConversation('conv-1');
    expect(result).toBeNull();
    expect(findMany).toHaveBeenCalledOnce();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('GOOGLE_API_KEY 없음 → null, LLM 미호출, update 미호출', async () => {
    delete process.env.GOOGLE_API_KEY;
    const { prisma, update } = makePrismaMock(SAMPLE_MESSAGES);
    const svc = makeService(prisma);

    const result = await svc.summarizeConversation('conv-1');
    expect(result).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('정상 → 요약 반환 + summary/summarizedAt update 호출', async () => {
    mockInvoke.mockResolvedValue({ content: '롯데 팬이며 응원에 진심.' });
    const { prisma, update } = makePrismaMock(SAMPLE_MESSAGES);
    const svc = makeService(prisma);

    const result = await svc.summarizeConversation('conv-1');
    expect(result).toBe('롯데 팬이며 응원에 진심.');
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'conv-1' });
    expect(arg.data.summary).toBe('롯데 팬이며 응원에 진심.');
    expect(arg.data.summarizedAt).toBeInstanceOf(Date);
  });

  it('LLM 빈 응답 → null, update 미호출', async () => {
    mockInvoke.mockResolvedValue({ content: '   ' });
    const { prisma, update } = makePrismaMock(SAMPLE_MESSAGES);
    const svc = makeService(prisma);

    const result = await svc.summarizeConversation('conv-1');
    expect(result).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('LLM 오류 → null(throw 금지), update 미호출', async () => {
    mockInvoke.mockRejectedValue(new Error('quota'));
    const { prisma, update } = makePrismaMock(SAMPLE_MESSAGES);
    const svc = makeService(prisma);

    const result = await svc.summarizeConversation('conv-1');
    expect(result).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
