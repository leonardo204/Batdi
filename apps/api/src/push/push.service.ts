/**
 * PushService — 푸시 전송 파사드 (P4-W11 — ADR-055).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-055)
 *
 * 다른 모듈이 sendToUser/sendLevelUp 을 호출해 푸시를 보낼 수 있도록 export 한다.
 * 내부적으로 PUSH_PROVIDER(LocalWebPushProvider)에 위임 → 전송 벤더(P6 FCM)는 교체만 하면 됨.
 *
 * 모두 best-effort(throw 금지). 트리거 결정 함수(push-triggers)와 조합해 사용한다.
 */
import { Inject, Injectable } from '@nestjs/common';
import { currentLevelRule } from './level-name';
import {
  PUSH_PROVIDER,
  type PushPayload,
  type PushProvider,
} from './push.provider';
import { levelUpTrigger } from './push-triggers';

@Injectable()
export class PushService {
  constructor(
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
  ) {}

  /** 푸시 활성 여부(VAPID 설정됨). */
  isEnabled(): boolean {
    return this.provider.isEnabled();
  }

  /**
   * 임의 페이로드를 한 사용자에게 전송(best-effort).
   * @returns 전송 성공 구독 수
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    return this.provider.sendToUser(userId, payload);
  }

  /**
   * 레벨업 푸시 헬퍼 — prev/new 레벨로 levelUpTrigger 를 평가해 발송.
   *
   * ⚠️ 실 이벤트 배선(잔여): 레벨업 소스는 agent(conversation-store).updateLevelProgress 의
   *   leveledUp 이지만 agent→api 직접 호출은 경계 위반이다. MVP 는 api 측에서 호출 가능한
   *   이 헬퍼만 제공한다. 실제 배선은 agent 가 api push 엔드포인트를 호출하거나 공유 큐를
   *   두는 후속 작업(잔여)으로 남긴다.
   *
   * @returns 전송 성공 구독 수(상승 아님 → 0).
   */
  async sendLevelUp(
    userId: string,
    prevLevel: number,
    newLevel: number,
  ): Promise<number> {
    const levelName = currentLevelRule(newLevel).name;
    const payload = levelUpTrigger(prevLevel, newLevel, levelName);
    if (!payload) {
      return 0;
    }
    return this.provider.sendToUser(userId, payload);
  }
}
