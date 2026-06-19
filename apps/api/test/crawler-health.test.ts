/**
 * crawler-health.test.ts — CrawlerHealthManager 단위 테스트 (vitest, P3-W7 7.3c).
 *
 * 순수 인메모리 상태 관리 검증 — DB/네트워크/Playwright 실호출 없음.
 * 핵심: 3회 연속 실패 → 자동 비활성, 성공 → 카운트 리셋·재활성, reset 동작, getHealth 구조.
 * 시간값(lastSuccessAt/lastFailureAt)은 null 여부만 단언(결정성 위해 절대시각 비교 회피).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  CrawlerHealthManager,
  CRAWL_SOURCES,
  FAILURE_THRESHOLD,
  type CrawlSource,
} from '../src/kbo/crawler-health';

describe('CrawlerHealthManager', () => {
  let mgr: CrawlerHealthManager;

  beforeEach(() => {
    mgr = new CrawlerHealthManager();
  });

  it('초기 상태: 모든 소스 활성(isEnabled=true), 실패 0', () => {
    for (const source of CRAWL_SOURCES) {
      expect(mgr.isEnabled(source)).toBe(true);
      const h = mgr.getHealth()[source];
      expect(h.consecutiveFailures).toBe(0);
      expect(h.disabled).toBe(false);
      expect(h.lastSuccessAt).toBeNull();
      expect(h.lastFailureAt).toBeNull();
    }
  });

  it('3회 연속 실패 → 자동 비활성(isEnabled=false), 그 전(1·2회)엔 활성', () => {
    const source: CrawlSource = 'schedule';

    mgr.recordFailure(source); // 1회
    expect(mgr.isEnabled(source)).toBe(true);

    mgr.recordFailure(source); // 2회
    expect(mgr.isEnabled(source)).toBe(true);

    mgr.recordFailure(source); // 3회 → 비활성
    expect(mgr.isEnabled(source)).toBe(false);

    const h = mgr.getHealth()[source];
    expect(h.consecutiveFailures).toBe(FAILURE_THRESHOLD);
    expect(h.disabled).toBe(true);
    expect(h.lastFailureAt).toBeInstanceOf(Date);
  });

  it('recordSuccess: consecutiveFailures 리셋 + 재활성(disabled=false)', () => {
    const source: CrawlSource = 'teamrank';

    // 3회 실패로 비활성화.
    mgr.recordFailure(source);
    mgr.recordFailure(source);
    mgr.recordFailure(source);
    expect(mgr.isEnabled(source)).toBe(false);

    // 성공 1회로 재활성 + 카운트 0.
    mgr.recordSuccess(source);
    expect(mgr.isEnabled(source)).toBe(true);
    const h = mgr.getHealth()[source];
    expect(h.consecutiveFailures).toBe(0);
    expect(h.disabled).toBe(false);
    expect(h.lastSuccessAt).toBeInstanceOf(Date);
  });

  it('실패2 → 성공 → 실패1: 연속 카운트 리셋되어 비활성 안 됨', () => {
    const source: CrawlSource = 'hitter';

    mgr.recordFailure(source); // 1
    mgr.recordFailure(source); // 2
    mgr.recordSuccess(source); // reset → 0
    mgr.recordFailure(source); // 1 (연속 아님)

    expect(mgr.isEnabled(source)).toBe(true);
    expect(mgr.getHealth()[source].consecutiveFailures).toBe(1);
  });

  it('소스별 독립 판정: 한 소스 비활성이 다른 소스에 영향 없음', () => {
    mgr.recordFailure('schedule');
    mgr.recordFailure('schedule');
    mgr.recordFailure('schedule'); // schedule 비활성

    expect(mgr.isEnabled('schedule')).toBe(false);
    expect(mgr.isEnabled('teamrank')).toBe(true);
    expect(mgr.isEnabled('hitter')).toBe(true);
    expect(mgr.isEnabled('pitcher')).toBe(true);
  });

  it('reset(source): 해당 소스만 초기화·재활성', () => {
    mgr.recordFailure('pitcher');
    mgr.recordFailure('pitcher');
    mgr.recordFailure('pitcher');
    mgr.recordFailure('hitter');
    expect(mgr.isEnabled('pitcher')).toBe(false);

    mgr.reset('pitcher');
    expect(mgr.isEnabled('pitcher')).toBe(true);
    expect(mgr.getHealth().pitcher.consecutiveFailures).toBe(0);
    // hitter 는 영향 없음.
    expect(mgr.getHealth().hitter.consecutiveFailures).toBe(1);
  });

  it('reset(): 전 소스 초기화', () => {
    for (const source of CRAWL_SOURCES) {
      mgr.recordFailure(source);
      mgr.recordFailure(source);
      mgr.recordFailure(source);
    }
    mgr.reset();
    for (const source of CRAWL_SOURCES) {
      expect(mgr.isEnabled(source)).toBe(true);
      expect(mgr.getHealth()[source].consecutiveFailures).toBe(0);
    }
  });

  it("news 소스(P3-W7 7.5): CRAWL_SOURCES 포함 + 독립 3회 실패 자동 비활성·성공 재활성", () => {
    // news 가 소스 목록에 등록돼 있다.
    expect(CRAWL_SOURCES).toContain('news');
    expect(mgr.isEnabled('news')).toBe(true);

    mgr.recordFailure('news');
    mgr.recordFailure('news');
    mgr.recordFailure('news'); // 3회 → 비활성
    expect(mgr.isEnabled('news')).toBe(false);
    // 다른 소스는 영향 없음(독립).
    expect(mgr.isEnabled('schedule')).toBe(true);

    mgr.recordSuccess('news'); // 성공 → 재활성
    expect(mgr.isEnabled('news')).toBe(true);
    expect(mgr.getHealth().news.consecutiveFailures).toBe(0);
  });

  it('lineup 소스(ADR-056): CRAWL_SOURCES 포함 + 독립 3회 실패 자동 비활성·성공 재활성', () => {
    expect(CRAWL_SOURCES).toContain('lineup');
    expect(mgr.isEnabled('lineup')).toBe(true);

    mgr.recordFailure('lineup');
    mgr.recordFailure('lineup');
    mgr.recordFailure('lineup'); // 3회 → 비활성
    expect(mgr.isEnabled('lineup')).toBe(false);
    // 다른 소스는 영향 없음(독립).
    expect(mgr.isEnabled('news')).toBe(true);

    mgr.recordSuccess('lineup'); // 성공 → 재활성
    expect(mgr.isEnabled('lineup')).toBe(true);
    expect(mgr.getHealth().lineup.consecutiveFailures).toBe(0);
  });

  it('h2h 소스(ADR-057): CRAWL_SOURCES 포함 + 독립 3회 실패 자동 비활성·성공 재활성', () => {
    expect(CRAWL_SOURCES).toContain('h2h');
    expect(mgr.isEnabled('h2h')).toBe(true);

    mgr.recordFailure('h2h');
    mgr.recordFailure('h2h');
    mgr.recordFailure('h2h'); // 3회 → 비활성
    expect(mgr.isEnabled('h2h')).toBe(false);
    // 다른 소스는 영향 없음(독립).
    expect(mgr.isEnabled('teamrank')).toBe(true);

    mgr.recordSuccess('h2h'); // 성공 → 재활성
    expect(mgr.isEnabled('h2h')).toBe(true);
    expect(mgr.getHealth().h2h.consecutiveFailures).toBe(0);
  });

  it('getHealth: 모든 소스 키 + 구조 반환(복사본 — 외부 변형이 내부에 영향 없음)', () => {
    const snapshot = mgr.getHealth();
    expect(Object.keys(snapshot).sort()).toEqual(
      [...CRAWL_SOURCES].sort(),
    );
    // 반환 복사본을 변형해도 내부 상태 불변.
    snapshot.schedule.consecutiveFailures = 99;
    expect(mgr.getHealth().schedule.consecutiveFailures).toBe(0);
  });
});
