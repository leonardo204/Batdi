/**
 * crawler-health.ts — CrawlerHealthManager (P3-W7 7.3c).
 *
 * 소스별 크롤 성공/실패를 추적해 3회 연속 실패 시 자동 비활성 + 경고 알림 +
 * graceful degradation 을 제공한다. 스케줄러가 크롤 직전 isEnabled(source) 로
 * 게이트하여, 비활성 소스는 skip 하고 나머지 소스는 계속 진행한다(graceful degradation).
 *
 * ⚠️ 상태는 인메모리로만 관리한다(영속 X). 프로세스 재시작 시 상태가 리셋되어
 *    모든 소스가 재활성화된다 — MVP 허용 범위(일일 스케줄이라 재시작=재시도 기회).
 *    영속/대시보드가 필요해지면 P5 에서 DB 또는 캐시로 승격한다.
 *
 * ⚠️ 실알림(Telegram/Admin)은 현재 로깅으로 대체(stub)한다. P5 Admin 연동 시
 *    this.logger 경고 지점을 실제 알림 채널 호출로 교체한다(TODO).
 */

import { Injectable, Logger } from '@nestjs/common';

/** 크롤 소스 식별자 — 각 소스는 독립적으로 성공/실패·비활성을 판정한다. */
export type CrawlSource =
  | 'schedule'
  | 'teamrank'
  | 'hitter'
  | 'pitcher'
  | 'news'
  | 'lineup'
  | 'h2h';

/** 모든 크롤 소스 목록(상태 초기화·getHealth 순회용). */
export const CRAWL_SOURCES: readonly CrawlSource[] = [
  'schedule',
  'teamrank',
  'hitter',
  'pitcher',
  'news',
  'lineup',
  'h2h',
] as const;

/** 자동 비활성 임계치 — 연속 실패가 이 횟수에 도달하면 disabled=true. */
export const FAILURE_THRESHOLD = 3;

/** 소스별 헬스 상태(인메모리). */
export interface CrawlSourceHealth {
  /** 연속 실패 횟수(성공 시 0 으로 리셋). */
  consecutiveFailures: number;
  /** 자동 비활성 여부(임계 도달 시 true, 성공/리셋 시 false). */
  disabled: boolean;
  /** 마지막 성공 시각(없으면 null). */
  lastSuccessAt: Date | null;
  /** 마지막 실패 시각(없으면 null). */
  lastFailureAt: Date | null;
}

@Injectable()
export class CrawlerHealthManager {
  private readonly logger = new Logger(CrawlerHealthManager.name);

  /** 소스별 인메모리 헬스 상태(영속 X — 재시작 시 리셋). */
  private readonly health: Record<CrawlSource, CrawlSourceHealth> = {
    schedule: this.initState(),
    teamrank: this.initState(),
    hitter: this.initState(),
    pitcher: this.initState(),
    news: this.initState(),
    lineup: this.initState(),
    h2h: this.initState(),
  };

  /** 초기 헬스 상태(모든 소스 활성·실패 0). */
  private initState(): CrawlSourceHealth {
    return {
      consecutiveFailures: 0,
      disabled: false,
      lastSuccessAt: null,
      lastFailureAt: null,
    };
  }

  /**
   * 크롤 성공 기록 — 연속 실패 카운트 리셋 + 재활성(disabled=false).
   * @param source 크롤 소스
   */
  recordSuccess(source: CrawlSource): void {
    const state = this.health[source];
    const wasDisabled = state.disabled;
    state.consecutiveFailures = 0;
    state.disabled = false;
    state.lastSuccessAt = new Date();
    if (wasDisabled) {
      this.logger.log(`소스 ${source} 크롤 성공 → 자동 재활성(disabled 해제)`);
    }
  }

  /**
   * 크롤 실패 기록 — 연속 실패 카운트 증가. 임계(3회) 도달 시 자동 비활성 + 경고 알림.
   * @param source 크롤 소스
   */
  recordFailure(source: CrawlSource): void {
    const state = this.health[source];
    state.consecutiveFailures += 1;
    state.lastFailureAt = new Date();

    if (state.consecutiveFailures >= FAILURE_THRESHOLD && !state.disabled) {
      state.disabled = true;
      // ⚠️ 실알림(Telegram/Admin)은 P5 연동 — 현재는 로깅으로 대체(stub).
      this.logger.error(
        `소스 ${source} ${state.consecutiveFailures}회 연속 실패 → 자동 비활성(Admin 알림)`,
      );
    } else {
      this.logger.warn(
        `소스 ${source} 크롤 실패(${state.consecutiveFailures}/${FAILURE_THRESHOLD})`,
      );
    }
  }

  /**
   * 소스 활성 여부 — disabled 면 false(스케줄러가 크롤 skip).
   * @param source 크롤 소스
   */
  isEnabled(source: CrawlSource): boolean {
    return !this.health[source].disabled;
  }

  /**
   * 전 소스 헬스 스냅샷(Admin 조회용, P5). 내부 상태 복사본을 반환한다.
   */
  getHealth(): Record<CrawlSource, CrawlSourceHealth> {
    return {
      schedule: { ...this.health.schedule },
      teamrank: { ...this.health.teamrank },
      hitter: { ...this.health.hitter },
      pitcher: { ...this.health.pitcher },
      news: { ...this.health.news },
      lineup: { ...this.health.lineup },
      h2h: { ...this.health.h2h },
    };
  }

  /**
   * 수동 재활성(테스트/운영). source 지정 시 해당 소스만, 미지정 시 전 소스 리셋.
   * @param source 리셋할 소스(생략 시 전체)
   */
  reset(source?: CrawlSource): void {
    if (source) {
      this.health[source] = this.initState();
      return;
    }
    for (const s of CRAWL_SOURCES) {
      this.health[s] = this.initState();
    }
  }
}
