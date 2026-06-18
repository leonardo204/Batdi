/**
 * PushController — Web Push 구독 관리 + VAPID 공개키 제공 (P4-W11 — ADR-055).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-055)
 *
 *  - POST /push/subscribe   (JwtAuthGuard): {endpoint, keys:{p256dh, auth}} → upsert(by endpoint).
 *      소유자는 항상 req.user.userId. 같은 endpoint 재구독은 멱등(userId·키 갱신).
 *  - POST /push/unsubscribe (JwtAuthGuard): {endpoint} → 삭제(본인 소유만).
 *  - GET  /push/vapid-public-key (인증 불요): {publicKey: VAPID_PUBLIC_KEY ?? null}.
 *      키 미설정 시 null → web 이 "푸시 비활성"으로 graceful 안내.
 *
 * ⚠️ LLM/악용 방지: 바디는 서버에서 형태 검증(BadRequest). 소유자는 항상 토큰의 userId.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, type RequestWithUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { VAPID_PUBLIC_KEY_ENV } from './push.provider';

/** POST /push/subscribe 요청 바디(브라우저 PushSubscription.toJSON 형태). */
interface SubscribeBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown } | null;
}

/** POST /push/unsubscribe 요청 바디. */
interface UnsubscribeBody {
  endpoint?: unknown;
}

@Controller('push')
export class PushController {
  constructor(private readonly prisma: PrismaService) {}

  /** 구독 저장(endpoint 자연키 upsert, 소유자=req.user). */
  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(
    @Req() req: RequestWithUser,
    @Body() body: SubscribeBody,
  ): Promise<{ success: true }> {
    const userId = req.user.userId;
    const endpoint = body.endpoint;
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;

    if (
      typeof endpoint !== 'string' ||
      endpoint.length === 0 ||
      typeof p256dh !== 'string' ||
      p256dh.length === 0 ||
      typeof auth !== 'string' ||
      auth.length === 0
    ) {
      throw new BadRequestException('유효하지 않은 구독 정보입니다.');
    }

    // endpoint 가 자연키(@unique) → 같은 브라우저 재구독은 멱등(userId/키 갱신).
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      update: { userId, p256dh, auth },
    });

    return { success: true };
  }

  /** 구독 해제(본인 소유 endpoint 만 삭제). */
  @UseGuards(JwtAuthGuard)
  @Post('unsubscribe')
  async unsubscribe(
    @Req() req: RequestWithUser,
    @Body() body: UnsubscribeBody,
  ): Promise<{ success: true }> {
    const userId = req.user.userId;
    const endpoint = body.endpoint;
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
      throw new BadRequestException('endpoint 가 필요합니다.');
    }

    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });

    return { success: true };
  }

  /** VAPID 공개키 제공(인증 불요). 미설정 시 null → web graceful 비활성. */
  @Get('vapid-public-key')
  getVapidPublicKey(): { publicKey: string | null } {
    return { publicKey: process.env[VAPID_PUBLIC_KEY_ENV] ?? null };
  }
}
