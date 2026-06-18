/**
 * session-end-scheduler.test.ts — SessionEndScheduler 유닛 테스트 (P3-W9 9.3).
 *
 * 게이트(SESSION_SUMMARY_ENABLED) + 스윕 대상 선정/순차 요약 호출을 prisma 모킹으로 검증한다.
 *  - enabled=false → 조회/요약 미호출(no-op).
 *  - enabled + 대상 row(모킹) → 각 conversation 에 summarizeConversation 호출.
 *  - 대상 0건 → 요약 미호출.
 *  - 자정 스윕: idleBefore 없이 findMany 호출(updatedAt 컷오프 미적용).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionEndScheduler } from '../src/conversation/session-end.scheduler';

function makeMocks(targets: { id: string }[]) {
  const findMany = vi.fn().mockResolvedValue(targets);
  const prisma = {
    conversation: {
      findMany,
      // fields.updatedAt 참조(스케줄러 WHERE 절에서 사용) — 구조만 흉내.
      fields: { updatedAt: { name: 'updatedAt' } },
    },
  };
  const summarizeConversation = vi.fn().mockResolvedValue('요약');
  const summary = { summarizeConversation };
  const scheduler = new SessionEndScheduler(prisma as never, summary as never);
  return { scheduler, findMany, summarizeConversation };
}

describe('SessionEndScheduler', () => {
  const prevEnabled = process.env.SESSION_SUMMARY_ENABLED;

  beforeEach(() => {
    delete process.env.SESSION_SUMMARY_ENABLED;
  });
  afterEach(() => {
    if (prevEnabled === undefined) {
      delete process.env.SESSION_SUMMARY_ENABLED;
    } else {
      process.env.SESSION_SUMMARY_ENABLED = prevEnabled;
    }
  });

  it('SESSION_SUMMARY_ENABLED 미설정 → idle 스윕 no-op(조회/요약 미호출)', async () => {
    const { scheduler, findMany, summarizeConversation } = makeMocks([
      { id: 'c1' },
    ]);
    await scheduler.runIdleSweep();
    expect(findMany).not.toHaveBeenCalled();
    expect(summarizeConversation).not.toHaveBeenCalled();
  });

  it("SESSION_SUMMARY_ENABLED='false' → 자정 스윕 no-op", async () => {
    process.env.SESSION_SUMMARY_ENABLED = 'false';
    const { scheduler, findMany, summarizeConversation } = makeMocks([
      { id: 'c1' },
    ]);
    await scheduler.runMidnightSweep();
    expect(findMany).not.toHaveBeenCalled();
    expect(summarizeConversation).not.toHaveBeenCalled();
  });

  it("enabled + idle 대상 2건 → 각각 summarizeConversation 순차 호출", async () => {
    process.env.SESSION_SUMMARY_ENABLED = 'true';
    const { scheduler, findMany, summarizeConversation } = makeMocks([
      { id: 'c1' },
      { id: 'c2' },
    ]);
    await scheduler.runIdleSweep();
    expect(findMany).toHaveBeenCalledOnce();
    // idle 스윕은 updatedAt 컷오프(< idleBefore)를 WHERE 에 포함.
    const where = findMany.mock.calls[0][0].where;
    expect(where.updatedAt).toBeDefined();
    expect(where.messages).toEqual({ some: {} });
    expect(summarizeConversation).toHaveBeenCalledTimes(2);
    expect(summarizeConversation).toHaveBeenNthCalledWith(1, 'c1');
    expect(summarizeConversation).toHaveBeenNthCalledWith(2, 'c2');
  });

  it('enabled + 대상 0건 → 요약 미호출', async () => {
    process.env.SESSION_SUMMARY_ENABLED = 'true';
    const { scheduler, findMany, summarizeConversation } = makeMocks([]);
    await scheduler.runIdleSweep();
    expect(findMany).toHaveBeenCalledOnce();
    expect(summarizeConversation).not.toHaveBeenCalled();
  });

  it('자정 스윕: idle 컷오프 없이 findMany 호출(updatedAt 컷오프 미적용)', async () => {
    process.env.SESSION_SUMMARY_ENABLED = 'true';
    const { scheduler, findMany, summarizeConversation } = makeMocks([
      { id: 'c9' },
    ]);
    await scheduler.runMidnightSweep();
    const where = findMany.mock.calls[0][0].where;
    expect(where.updatedAt).toBeUndefined();
    expect(where.messages).toEqual({ some: {} });
    expect(summarizeConversation).toHaveBeenCalledOnce();
  });
});
