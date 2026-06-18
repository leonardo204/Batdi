/**
 * profile-learning-scheduler.test.ts — ProfileLearningScheduler 유닛 테스트 (P3-W9 9.4).
 *
 * 게이트(PROFILE_LEARNING_ENABLED) + 트리거 필터(isLearnDue) + 순차 학습 호출을 prisma 모킹으로
 * 검증한다.
 *  - isLearnDue: (50,{})→true / (60,{last:50})→false / (100,{last:50})→true / (49,{})→false.
 *  - enabled=false → 조회/학습 미호출(no-op).
 *  - enabled + 대상 row(모킹) → 필터 통과 userId 에 learnFromConversation 호출.
 *  - 후보는 있으나 모두 필터 탈락 → 학습 미호출.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProfileLearningScheduler,
  isLearnDue,
} from '../src/conversation/profile-learning.scheduler';

function makeMocks(
  candidates: { userId: string; messageCount: number; profileData: unknown }[],
) {
  const findMany = vi.fn().mockResolvedValue(candidates);
  const prisma = { personalAgentState: { findMany } };
  const learnFromConversation = vi.fn().mockResolvedValue(true);
  const learning = { learnFromConversation };
  const scheduler = new ProfileLearningScheduler(
    prisma as never,
    learning as never,
  );
  return { scheduler, findMany, learnFromConversation };
}

describe('isLearnDue', () => {
  it('messageCount=50, lastLearnedCount=0 → 대상(true)', () => {
    expect(isLearnDue(50, {})).toBe(true);
    expect(isLearnDue(50, { lastLearnedCount: 0 })).toBe(true);
  });
  it('messageCount=60, lastLearnedCount=50 → 차이 10 < 50 → 비대상(false)', () => {
    expect(isLearnDue(60, { lastLearnedCount: 50 })).toBe(false);
  });
  it('messageCount=100, lastLearnedCount=50 → 차이 50 >= 50 → 대상(true)', () => {
    expect(isLearnDue(100, { lastLearnedCount: 50 })).toBe(true);
  });
  it('messageCount=49, lastLearnedCount=0 → 차이 49 < 50 → 비대상(false)', () => {
    expect(isLearnDue(49, {})).toBe(false);
  });
  it('profileData 가 객체 아님/null → lastLearnedCount=0 취급', () => {
    expect(isLearnDue(50, null)).toBe(true);
    expect(isLearnDue(50, 'garbage')).toBe(true);
    expect(isLearnDue(49, null)).toBe(false);
  });
});

describe('ProfileLearningScheduler.runLearningSweep', () => {
  const prevEnabled = process.env.PROFILE_LEARNING_ENABLED;

  beforeEach(() => {
    delete process.env.PROFILE_LEARNING_ENABLED;
  });
  afterEach(() => {
    if (prevEnabled === undefined) {
      delete process.env.PROFILE_LEARNING_ENABLED;
    } else {
      process.env.PROFILE_LEARNING_ENABLED = prevEnabled;
    }
  });

  it('PROFILE_LEARNING_ENABLED 미설정 → no-op(조회/학습 미호출)', async () => {
    const { scheduler, findMany, learnFromConversation } = makeMocks([
      { userId: 'u1', messageCount: 50, profileData: {} },
    ]);
    await scheduler.runLearningSweep();
    expect(findMany).not.toHaveBeenCalled();
    expect(learnFromConversation).not.toHaveBeenCalled();
  });

  it("PROFILE_LEARNING_ENABLED='false' → no-op", async () => {
    process.env.PROFILE_LEARNING_ENABLED = 'false';
    const { scheduler, findMany, learnFromConversation } = makeMocks([
      { userId: 'u1', messageCount: 50, profileData: {} },
    ]);
    await scheduler.runLearningSweep();
    expect(findMany).not.toHaveBeenCalled();
    expect(learnFromConversation).not.toHaveBeenCalled();
  });

  it('enabled + 대상 2건(필터 통과) → 각각 learnFromConversation 순차 호출', async () => {
    process.env.PROFILE_LEARNING_ENABLED = 'true';
    const { scheduler, findMany, learnFromConversation } = makeMocks([
      { userId: 'u1', messageCount: 50, profileData: {} },
      { userId: 'u2', messageCount: 100, profileData: { lastLearnedCount: 50 } },
    ]);
    await scheduler.runLearningSweep();
    expect(findMany).toHaveBeenCalledOnce();
    // 1차 후보 WHERE: messageCount >= LEARN_INTERVAL.
    const where = findMany.mock.calls[0][0].where;
    expect(where.messageCount).toEqual({ gte: 50 });
    expect(learnFromConversation).toHaveBeenCalledTimes(2);
    expect(learnFromConversation).toHaveBeenNthCalledWith(1, 'u1');
    expect(learnFromConversation).toHaveBeenNthCalledWith(2, 'u2');
  });

  it('enabled + 후보 있으나 모두 필터 탈락 → 학습 미호출', async () => {
    process.env.PROFILE_LEARNING_ENABLED = 'true';
    const { scheduler, findMany, learnFromConversation } = makeMocks([
      { userId: 'u1', messageCount: 60, profileData: { lastLearnedCount: 50 } },
    ]);
    await scheduler.runLearningSweep();
    expect(findMany).toHaveBeenCalledOnce();
    expect(learnFromConversation).not.toHaveBeenCalled();
  });

  it('enabled + 후보 0건 → 학습 미호출', async () => {
    process.env.PROFILE_LEARNING_ENABLED = 'true';
    const { scheduler, findMany, learnFromConversation } = makeMocks([]);
    await scheduler.runLearningSweep();
    expect(findMany).toHaveBeenCalledOnce();
    expect(learnFromConversation).not.toHaveBeenCalled();
  });

  it('학습 중 일부 throw 해도 다음 대상 계속(best-effort)', async () => {
    process.env.PROFILE_LEARNING_ENABLED = 'true';
    const { scheduler, learnFromConversation } = makeMocks([
      { userId: 'u1', messageCount: 50, profileData: {} },
      { userId: 'u2', messageCount: 50, profileData: {} },
    ]);
    learnFromConversation.mockRejectedValueOnce(new Error('boom'));
    await scheduler.runLearningSweep();
    expect(learnFromConversation).toHaveBeenCalledTimes(2);
  });
});
