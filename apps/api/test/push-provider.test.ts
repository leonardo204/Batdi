/**
 * push-provider.test.ts — LocalWebPushProvider + PushService (P4-W11 — ADR-055).
 *
 * web-push 모킹으로 검증:
 *  - 키 미설정 → isEnabled false, sendToUser no-op(전송 0).
 *  - 키 설정 → 구독 없음 no-op / 전송 성공 카운트 / 410 만료 구독 정리.
 *  - PushService.sendLevelUp: 상승 시 발송, 동일 시 0.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// web-push 모킹 — setVapidDetails(성공), sendNotification(테스트별 제어).
const setVapidDetails = vi.fn();
const sendNotification = vi.fn();
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

import { LocalWebPushProvider, PUSH_PROVIDER } from '../src/push/push.provider';
import { PushService } from '../src/push/push.service';

const PUB = 'PUBKEY';
const PRIV = 'PRIVKEY';

function makePrisma(opts: {
  subs?: { id: string; endpoint: string; p256dh: string; auth: string }[];
}) {
  const findMany = vi.fn().mockResolvedValue(opts.subs ?? []);
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  return {
    prisma: { pushSubscription: { findMany, deleteMany } },
    findMany,
    deleteMany,
  };
}

beforeEach(() => {
  setVapidDetails.mockClear();
  sendNotification.mockReset();
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

describe('LocalWebPushProvider — 키 미설정', () => {
  it('isEnabled false + sendToUser no-op(0)', async () => {
    const { prisma, findMany } = makePrisma({});
    const provider = new LocalWebPushProvider(prisma as never);
    expect(provider.isEnabled()).toBe(false);
    const sent = await provider.sendToUser('u1', { title: 't', body: 'b' });
    expect(sent).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
    expect(setVapidDetails).not.toHaveBeenCalled();
  });
});

describe('LocalWebPushProvider — 키 설정', () => {
  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = PUB;
    process.env.VAPID_PRIVATE_KEY = PRIV;
  });

  it('생성 시 setVapidDetails 호출 + isEnabled true', () => {
    const { prisma } = makePrisma({});
    const provider = new LocalWebPushProvider(prisma as never);
    expect(provider.isEnabled()).toBe(true);
    expect(setVapidDetails).toHaveBeenCalledTimes(1);
  });

  it('구독 없음 → 전송 0(no-op)', async () => {
    const { prisma } = makePrisma({ subs: [] });
    const provider = new LocalWebPushProvider(prisma as never);
    const sent = await provider.sendToUser('u1', { title: 't', body: 'b' });
    expect(sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('구독 2개 모두 성공 → 전송 2', async () => {
    const { prisma, deleteMany } = makePrisma({
      subs: [
        { id: 's1', endpoint: 'e1', p256dh: 'k1', auth: 'a1' },
        { id: 's2', endpoint: 'e2', p256dh: 'k2', auth: 'a2' },
      ],
    });
    sendNotification.mockResolvedValue({});
    const provider = new LocalWebPushProvider(prisma as never);
    const sent = await provider.sendToUser('u1', { title: 't', body: 'b' });
    expect(sent).toBe(2);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('410 만료 구독 → 정리(deleteMany) + 성공분만 카운트', async () => {
    const { prisma, deleteMany } = makePrisma({
      subs: [
        { id: 's1', endpoint: 'e1', p256dh: 'k1', auth: 'a1' },
        { id: 's2', endpoint: 'e2', p256dh: 'k2', auth: 'a2' },
      ],
    });
    sendNotification
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ statusCode: 410 });
    const provider = new LocalWebPushProvider(prisma as never);
    const sent = await provider.sendToUser('u1', { title: 't', body: 'b' });
    expect(sent).toBe(1);
    const arg = deleteMany.mock.calls[0][0] as { where: { id: { in: string[] } } };
    expect(arg.where.id.in).toEqual(['s2']);
  });

  it('일시 오류(500)는 삭제 안 함(삼킴)', async () => {
    const { prisma, deleteMany } = makePrisma({
      subs: [{ id: 's1', endpoint: 'e1', p256dh: 'k1', auth: 'a1' }],
    });
    sendNotification.mockRejectedValue({ statusCode: 500 });
    const provider = new LocalWebPushProvider(prisma as never);
    const sent = await provider.sendToUser('u1', { title: 't', body: 'b' });
    expect(sent).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('PushService.sendLevelUp', () => {
  it('레벨 상승 → provider.sendToUser 호출(payload 전달)', async () => {
    const sendToUser = vi.fn().mockResolvedValue(1);
    const provider = { isEnabled: () => true, sendToUser };
    const service = new PushService(provider as never);
    const sent = await service.sendLevelUp('u1', 1, 2);
    expect(sent).toBe(1);
    const [userId, payload] = sendToUser.mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(userId).toBe('u1');
    expect(payload.body).toContain('Lv2');
    expect(payload.body).toContain('내야석');
  });

  it('레벨 동일 → 전송 안 함(0)', async () => {
    const sendToUser = vi.fn().mockResolvedValue(0);
    const provider = { isEnabled: () => true, sendToUser };
    const service = new PushService(provider as never);
    const sent = await service.sendLevelUp('u1', 3, 3);
    expect(sent).toBe(0);
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('PUSH_PROVIDER 토큰 export 확인', () => {
    expect(PUSH_PROVIDER).toBe('PUSH_PROVIDER');
  });
});
