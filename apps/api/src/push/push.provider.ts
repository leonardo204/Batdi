/**
 * PushProvider 추상화 + LocalWebPushProvider (P4-W11 — ADR-055).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-055)
 *
 * - 푸시 전송을 외부 벤더에 직접 결합하지 않고 인터페이스로 추상화한다(CLAUDE.md — P6 FCM
 *   어댑터 교체 대비). 로컬(P4)은 LocalWebPushProvider(web-push npm + VAPID), P6 는
 *   FcmPushProvider 어댑터가 동일 PushProvider 를 만족 → 호출부(PushService)는 교체를 인지 못함.
 * - DI 토큰 PUSH_PROVIDER 로 구체 구현을 주입(push.module 바인딩).
 *
 * graceful 정책(throw 금지):
 *  - VAPID 키 미설정 → setVapidDetails 생략, sendToUser 는 no-op(로그만). 푸시 비활성.
 *  - 전송 중 404/410(만료 구독) → 해당 구독 삭제(정리). 그 외 오류는 best-effort(로그·삼킴).
 */
import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

/** NestJS DI 토큰 — 호출부는 이 토큰으로 구체 구현(Local/FCM)을 주입받는다. */
export const PUSH_PROVIDER = 'PUSH_PROVIDER';

/** 푸시 알림 페이로드 — SW(showNotification)와 트리거 함수가 공유하는 표준 형태. */
export interface PushPayload {
  /** 알림 제목(필수). */
  title: string;
  /** 알림 본문(필수). */
  body: string;
  /** 클릭 시 이동 경로(SW notificationclick 에서 사용). 기본 '/chat'. */
  url?: string;
  /** 트리거 식별 태그(관측/그룹핑용, 선택). */
  tag?: string;
}

/**
 * 푸시 전송 추상화. 호출부(PushService·스케줄러)는 이 인터페이스만 의존한다.
 */
export interface PushProvider {
  /** 푸시 활성 여부(VAPID 키 설정됨). false 면 sendToUser 는 no-op. */
  isEnabled(): boolean;

  /**
   * 한 사용자의 모든 구독으로 푸시 전송(best-effort).
   * @param userId  대상 사용자 id
   * @param payload 알림 페이로드
   * @returns 실제 전송 성공한 구독 수
   */
  sendToUser(userId: string, payload: PushPayload): Promise<number>;
}

/** VAPID 키 환경변수 이름. */
export const VAPID_PUBLIC_KEY_ENV = 'VAPID_PUBLIC_KEY';
export const VAPID_PRIVATE_KEY_ENV = 'VAPID_PRIVATE_KEY';
export const VAPID_SUBJECT_ENV = 'VAPID_SUBJECT';

/**
 * LocalWebPushProvider — web-push(VAPID) 기반 로컬 어댑터.
 *
 * 키가 모두 설정된 경우에만 활성(setVapidDetails). 미설정 시 isEnabled()=false 로
 * 전체 전송이 no-op 가 된다(graceful — throw 금지).
 */
@Injectable()
export class LocalWebPushProvider implements PushProvider {
  private readonly logger = new Logger(LocalWebPushProvider.name);
  private readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env[VAPID_PUBLIC_KEY_ENV];
    const privateKey = process.env[VAPID_PRIVATE_KEY_ENV];
    const subject = process.env[VAPID_SUBJECT_ENV] ?? 'mailto:admin@batdi.kr';

    if (publicKey && privateKey) {
      try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        this.enabled = true;
        this.logger.log('Web Push 활성(VAPID 설정 완료)');
      } catch (err) {
        // 잘못된 키 포맷 등 — 비활성으로 폴백(throw 금지).
        this.enabled = false;
        this.logger.warn(`VAPID 설정 실패 → 푸시 비활성: ${String(err)}`);
      }
    } else {
      this.enabled = false;
      this.logger.log('VAPID 키 미설정 → 푸시 비활성(graceful)');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 사용자 구독 전체로 전송. 만료(404/410) 구독은 삭제 정리한다.
   * 키 미설정·조회 실패·전송 실패는 모두 best-effort(로그 후 계속).
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.enabled) {
      return 0;
    }

    let subs: { id: string; endpoint: string; p256dh: string; auth: string }[];
    try {
      subs = await this.prisma.pushSubscription.findMany({
        where: { userId },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      });
    } catch (err) {
      this.logger.warn(`구독 조회 실패(${userId}): ${String(err)}`);
      return 0;
    }

    if (subs.length === 0) {
      return 0;
    }

    const json = JSON.stringify(payload);
    let sent = 0;
    const expiredIds: string[] = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json,
        );
        sent += 1;
      } catch (err) {
        // 410 Gone / 404 Not Found → 구독 만료. 그 외는 일시 오류로 두고 삼킨다.
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(sub.id);
        } else {
          this.logger.warn(
            `푸시 전송 실패(${userId}, status=${String(statusCode)}): ${String(err)}`,
          );
        }
      }
    }

    // 만료 구독 정리(best-effort).
    if (expiredIds.length > 0) {
      try {
        await this.prisma.pushSubscription.deleteMany({
          where: { id: { in: expiredIds } },
        });
      } catch (err) {
        this.logger.warn(`만료 구독 정리 실패: ${String(err)}`);
      }
    }

    return sent;
  }
}
