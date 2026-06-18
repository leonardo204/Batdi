/**
 * personal-agent-learning.test.ts — PersonalAgentLearningService 유닛 테스트 (P3-W9 9.4).
 *
 * prisma·LLM(@langchain/google-genai) 모킹으로 best-effort 계약을 검증한다(실 DB/네트워크 없음).
 *  - state 없음 → false, 메시지/LLM 미호출.
 *  - 메시지 없음 → false, LLM 미호출.
 *  - 키 없음 → false, LLM 미호출.
 *  - 정상(LLM 모킹) → profileSummary + profileData.lastLearnedCount + lastProfileUpdate update, true.
 *  - LLM 빈 응답/오류 → false, update 미호출.
 *
 * Gemini 모킹은 conversation-summary.test.ts 의 class 기반 모킹 패턴을 그대로 따른다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class {
    invoke = mockInvoke;
  },
}));

import { PersonalAgentLearningService } from '../src/conversation/personal-agent-learning.service';

type StateRow = {
  profileSummary: string | null;
  profileData: unknown;
  messageCount: number;
  user: { teamId: string; level: number } | null;
} | null;

/** 최소 prisma 모킹 — personalAgentState.findUnique/update, message.findMany. */
function makePrismaMock(opts: {
  state: StateRow;
  messages: { role: string | null; content: string }[];
}) {
  const findUnique = vi.fn().mockResolvedValue(opts.state);
  const findMany = vi.fn().mockResolvedValue(opts.messages);
  const update = vi.fn().mockResolvedValue({});
  const prisma = {
    personalAgentState: { findUnique, update },
    message: { findMany },
  };
  return { prisma, findUnique, findMany, update };
}

function makeService(prisma: unknown): PersonalAgentLearningService {
  return new PersonalAgentLearningService(prisma as never);
}

const SAMPLE_MESSAGES = [
  { role: 'user', content: '롯데 오늘 누가 선발이야?' },
  { role: 'assistant', content: '오늘 선발은 확인해볼게요!' },
  { role: 'user', content: '반말로 편하게 해줘' },
];

const SAMPLE_STATE: StateRow = {
  profileSummary: null,
  profileData: {},
  messageCount: 50,
  user: { teamId: 'lotte', level: 3 },
};

describe('PersonalAgentLearningService.learnFromConversation', () => {
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

  it('빈 userId → false, DB/LLM 미호출', async () => {
    const { prisma, findUnique, update } = makePrismaMock({
      state: SAMPLE_STATE,
      messages: SAMPLE_MESSAGES,
    });
    const svc = makeService(prisma);

    const result = await svc.learnFromConversation('');
    expect(result).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('PersonalAgentState 없음 → false, 메시지/LLM 미호출', async () => {
    const { prisma, findMany, update } = makePrismaMock({
      state: null,
      messages: SAMPLE_MESSAGES,
    });
    const svc = makeService(prisma);

    const result = await svc.learnFromConversation('u1');
    expect(result).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('메시지 없음 → false, LLM 미호출, update 미호출', async () => {
    const { prisma, findMany, update } = makePrismaMock({
      state: SAMPLE_STATE,
      messages: [],
    });
    const svc = makeService(prisma);

    const result = await svc.learnFromConversation('u1');
    expect(result).toBe(false);
    expect(findMany).toHaveBeenCalledOnce();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('GOOGLE_API_KEY 없음 → false, LLM 미호출, update 미호출', async () => {
    delete process.env.GOOGLE_API_KEY;
    const { prisma, update } = makePrismaMock({
      state: SAMPLE_STATE,
      messages: SAMPLE_MESSAGES,
    });
    const svc = makeService(prisma);

    const result = await svc.learnFromConversation('u1');
    expect(result).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('정상 → profileSummary + lastLearnedCount=messageCount + lastProfileUpdate update, true', async () => {
    mockInvoke.mockResolvedValue({
      content: '롯데 팬, 반말 선호, 선발 라인업을 자주 묻는다.',
    });
    const { prisma, update } = makePrismaMock({
      state: { ...SAMPLE_STATE, messageCount: 50, profileData: {} },
      messages: SAMPLE_MESSAGES,
    });
    const svc = makeService(prisma);

    const result = await svc.learnFromConversation('u1');
    expect(result).toBe(true);
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 'u1' });
    expect(arg.data.profileSummary).toBe(
      '롯데 팬, 반말 선호, 선발 라인업을 자주 묻는다.',
    );
    expect(arg.data.profileData.lastLearnedCount).toBe(50);
    expect(arg.data.lastProfileUpdate).toBeInstanceOf(Date);
  });

  it('기존 profileData 보존 + lastLearnedCount 갱신', async () => {
    mockInvoke.mockResolvedValue({ content: '갱신된 프로필.' });
    const { prisma, update } = makePrismaMock({
      state: {
        ...SAMPLE_STATE,
        messageCount: 100,
        profileData: { interests: ['선발'], lastLearnedCount: 50 },
      },
      messages: SAMPLE_MESSAGES,
    });
    const svc = makeService(prisma);

    const result = await svc.learnFromConversation('u1');
    expect(result).toBe(true);
    const arg = update.mock.calls[0][0];
    expect(arg.data.profileData.interests).toEqual(['선발']);
    expect(arg.data.profileData.lastLearnedCount).toBe(100);
  });

  it('LLM 빈 응답 → false, update 미호출', async () => {
    mockInvoke.mockResolvedValue({ content: '   ' });
    const { prisma, update } = makePrismaMock({
      state: SAMPLE_STATE,
      messages: SAMPLE_MESSAGES,
    });
    const svc = makeService(prisma);

    const result = await svc.learnFromConversation('u1');
    expect(result).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('LLM 오류 → false(throw 금지), update 미호출', async () => {
    mockInvoke.mockRejectedValue(new Error('quota'));
    const { prisma, update } = makePrismaMock({
      state: SAMPLE_STATE,
      messages: SAMPLE_MESSAGES,
    });
    const svc = makeService(prisma);

    const result = await svc.learnFromConversation('u1');
    expect(result).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
