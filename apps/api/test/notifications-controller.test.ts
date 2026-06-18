/**
 * notifications-controller.test.ts — NotificationsController 유닛 테스트 (P4-W10 10.1).
 *
 * toggleNotification 의 화이트리스트 검증·settings 토글·ToolCallLog 기록을 prisma 모킹으로 검증.
 *  - type 화이트리스트 외 → BadRequestException.
 *  - 사용자 없음 → NotFoundException.
 *  - 기본 true 가정 → 첫 토글 false + settings.notifications 갱신 + toolCallLog 기록.
 *  - 이미 false → 두 번째 토글 true.
 *  - toolCallLog 실패는 무시(토글 응답 정상).
 */
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationsController } from '../src/notifications/notifications.controller';
import type { RequestWithUser } from '../src/auth/jwt-auth.guard';

function makeController(opts: {
  user?: { settings: unknown } | null;
  toolLogThrows?: boolean;
}) {
  const findUnique = vi
    .fn()
    .mockResolvedValue(opts.user === undefined ? { settings: {} } : opts.user);
  const update = vi.fn().mockResolvedValue({});
  const toolCreate = opts.toolLogThrows
    ? vi.fn().mockRejectedValue(new Error('log down'))
    : vi.fn().mockResolvedValue({});

  const prisma = {
    user: { findUnique, update },
    toolCallLog: { create: toolCreate },
  };
  const controller = new NotificationsController(prisma as never);
  return { controller, findUnique, update, toolCreate };
}

function reqFor(userId: string): RequestWithUser {
  return { user: { userId } } as RequestWithUser;
}

describe('NotificationsController.toggleNotification', () => {
  it('type 화이트리스트 외 → BadRequestException', async () => {
    const { controller, findUnique } = makeController({});
    await expect(
      controller.toggleNotification(reqFor('u1'), { type: 'hacked' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('type 누락 → BadRequestException', async () => {
    const { controller } = makeController({});
    await expect(
      controller.toggleNotification(reqFor('u1'), {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('사용자 없음 → NotFoundException', async () => {
    const { controller, update } = makeController({ user: null });
    await expect(
      controller.toggleNotification(reqFor('u1'), { type: 'gameStart' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('기본 true 가정 → 첫 토글 false + settings 갱신 + toolCallLog 기록', async () => {
    const { controller, update, toolCreate } = makeController({
      user: { settings: {} },
    });
    const result = await controller.toggleNotification(reqFor('u1'), {
      type: 'gameStart',
    });
    expect(result).toEqual({ type: 'gameStart', enabled: false });

    const updateArg = update.mock.calls[0][0] as {
      where: { id: string };
      data: { settings: { notifications: Record<string, boolean> } };
    };
    expect(updateArg.where).toEqual({ id: 'u1' });
    expect(updateArg.data.settings.notifications.gameStart).toBe(false);

    expect(toolCreate).toHaveBeenCalledTimes(1);
    const logArg = toolCreate.mock.calls[0][0] as {
      data: { actionName: string; params: { type: string }; result: unknown };
    };
    expect(logArg.data.actionName).toBe('toggleNotification');
    expect(logArg.data.params).toEqual({ type: 'gameStart' });
  });

  it('이미 false → 두 번째 토글 true(다른 키 보존)', async () => {
    const { controller, update } = makeController({
      user: { settings: { notifications: { gameEnd: false }, theme: 'dark' } },
    });
    const result = await controller.toggleNotification(reqFor('u1'), {
      type: 'gameEnd',
    });
    expect(result).toEqual({ type: 'gameEnd', enabled: true });

    const updateArg = update.mock.calls[0][0] as {
      data: { settings: { notifications: Record<string, boolean>; theme: string } };
    };
    expect(updateArg.data.settings.notifications.gameEnd).toBe(true);
    expect(updateArg.data.settings.theme).toBe('dark');
  });

  it('toolCallLog 실패는 무시(토글 응답 정상)', async () => {
    const { controller } = makeController({
      user: { settings: {} },
      toolLogThrows: true,
    });
    const result = await controller.toggleNotification(reqFor('u1'), {
      type: 'levelUp',
    });
    expect(result).toEqual({ type: 'levelUp', enabled: false });
  });
});
