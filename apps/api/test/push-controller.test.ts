/**
 * push-controller.test.ts — PushController 유닛 테스트 (P4-W11 — ADR-055).
 *
 * subscribe upsert(멱등)·바디 검증·unsubscribe 삭제·vapid-public-key(키 유무)를 prisma 모킹으로 검증.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PushController } from '../src/push/push.controller';
import type { RequestWithUser } from '../src/auth/jwt-auth.guard';

function makeController() {
  const upsert = vi.fn().mockResolvedValue({});
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    pushSubscription: { upsert, deleteMany },
  };
  const controller = new PushController(prisma as never);
  return { controller, upsert, deleteMany };
}

function reqFor(userId: string): RequestWithUser {
  return { user: { userId } } as RequestWithUser;
}

const validSub = {
  endpoint: 'https://push.example.com/abc',
  keys: { p256dh: 'PKEY', auth: 'AUTH' },
};

afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
});

describe('PushController.subscribe', () => {
  it('유효 구독 → endpoint 자연키 upsert(소유자=req.user)', async () => {
    const { controller, upsert } = makeController();
    const result = await controller.subscribe(reqFor('u1'), validSub);
    expect(result).toEqual({ success: true });

    const arg = upsert.mock.calls[0][0] as {
      where: { endpoint: string };
      create: { userId: string; endpoint: string; p256dh: string; auth: string };
      update: { userId: string; p256dh: string; auth: string };
    };
    expect(arg.where).toEqual({ endpoint: validSub.endpoint });
    expect(arg.create.userId).toBe('u1');
    expect(arg.create.p256dh).toBe('PKEY');
    expect(arg.update.userId).toBe('u1');
  });

  it('endpoint 누락 → BadRequestException', async () => {
    const { controller, upsert } = makeController();
    await expect(
      controller.subscribe(reqFor('u1'), { keys: { p256dh: 'x', auth: 'y' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('keys 누락 → BadRequestException', async () => {
    const { controller } = makeController();
    await expect(
      controller.subscribe(reqFor('u1'), { endpoint: 'https://x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('p256dh 빈 문자열 → BadRequestException', async () => {
    const { controller } = makeController();
    await expect(
      controller.subscribe(reqFor('u1'), {
        endpoint: 'https://x',
        keys: { p256dh: '', auth: 'y' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PushController.unsubscribe', () => {
  it('endpoint 로 본인 구독 삭제', async () => {
    const { controller, deleteMany } = makeController();
    const result = await controller.unsubscribe(reqFor('u1'), {
      endpoint: validSub.endpoint,
    });
    expect(result).toEqual({ success: true });
    const arg = deleteMany.mock.calls[0][0] as {
      where: { endpoint: string; userId: string };
    };
    expect(arg.where).toEqual({ endpoint: validSub.endpoint, userId: 'u1' });
  });

  it('endpoint 누락 → BadRequestException', async () => {
    const { controller, deleteMany } = makeController();
    await expect(
      controller.unsubscribe(reqFor('u1'), {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('PushController.getVapidPublicKey', () => {
  it('키 설정됨 → publicKey 반환', () => {
    process.env.VAPID_PUBLIC_KEY = 'PUBKEY123';
    const { controller } = makeController();
    expect(controller.getVapidPublicKey()).toEqual({ publicKey: 'PUBKEY123' });
  });

  it('키 미설정 → null(graceful 비활성)', () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const { controller } = makeController();
    expect(controller.getVapidPublicKey()).toEqual({ publicKey: null });
  });
});
