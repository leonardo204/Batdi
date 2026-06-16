/**
 * kbo-scraper.ts — Playwright 기반 KBO 페이지 스크래퍼.
 *
 * ⚠️ CLAUDE.md 불변식: "크롤링 부하 제한: 요청 간격 10초+·동시 1·robots.txt 준수".
 * 레퍼런스(kbo-scraper)는 병렬(0.1~0.5초)이지만 여기서는 **절대 병렬 금지**.
 * for...of 순차 + 각 페이지 네비게이션 사이 sleep(REQUEST_DELAY_MS=10초 이상).
 * 일일 스케줄이라 레이턴시는 무관하다.
 *
 * robots.txt 준수(해당 경로 허용): /Schedule/ · /Record/ 는 Disallow 대상이 아니다.
 *
 * best-effort: 실패해도 throw 하지 않고 로깅 후 부분 결과 반환(graceful degradation).
 * playwright 는 devDependency 이므로 동적 import 로 로드한다(런타임 환경에 설치된 경우만 사용).
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  REQUEST_DELAY_MS,
  SCHEDULE_SELECTORS,
  SCHEDULE_URL,
  TEAM_RANK_SELECTORS,
  TEAM_RANK_URL,
} from './kbo.constants';
import { parseGameSchedule, parseTeamSeasonRecord } from './kbo-parser';
import type {
  KboGameRow,
  TeamSeasonRecordRow,
} from './kbo-parser';
import { getSeriesType, type SeriesTypeName } from './kbo-teams';

// Playwright 타입은 devDep 에서만 가져온다(런타임 동적 import 와 별개로 타입 안전성 확보).
import type { Browser, Page } from 'playwright';

/** 지정 ms 만큼 대기 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class KboScraper {
  private readonly logger = new Logger(KboScraper.name);

  /**
   * 지정 연/월 + 시리즈 목록의 경기일정을 순차 크롤링.
   * 각 (월 × 시리즈) 조합마다 드롭다운을 다시 선택하고 테이블을 추출한다.
   *
   * @param season 시즌(연도)
   * @param months 크롤링할 월 목록 (1~12)
   * @param seriesNames 크롤링할 시리즈 목록 (전 시리즈면 모두)
   * @returns 파싱된 경기 행들(부분 결과 가능)
   */
  async scrapeSchedule(
    season: number,
    months: number[],
    seriesNames: SeriesTypeName[],
  ): Promise<KboGameRow[]> {
    const results: KboGameRow[] = [];
    let browser: Browser | null = null;

    try {
      browser = await this.launchBrowser();
      if (!browser) {
        this.logger.warn('Playwright 로드 실패 — 경기일정 크롤링 생략');
        return results;
      }
      const page = await browser.newPage();
      await page.goto(SCHEDULE_URL, { waitUntil: 'networkidle' });

      // ⚠️ 순차 처리(동시 1) — for...of 중첩, 각 네비게이션 사이 10초 대기.
      for (const seriesName of seriesNames) {
        const series = getSeriesType(seriesName);
        for (const month of months) {
          try {
            await this.selectScheduleDropdowns(page, season, month, series.code);
            // 테이블 갱신 대기.
            await page.waitForLoadState('networkidle');
            await page.waitForSelector(SCHEDULE_SELECTORS.gamesTable);

            const html = await page
              .locator(SCHEDULE_SELECTORS.gamesTable)
              .evaluate((el: { outerHTML: string }) => el.outerHTML);
            const rows = parseGameSchedule(html, season, seriesName);
            results.push(...rows);
            this.logger.log(
              `경기일정 수집: ${season}-${month} ${seriesName} → ${rows.length}건`,
            );
          } catch (err) {
            // best-effort: 한 조합 실패는 건너뛰고 계속.
            this.logger.warn(
              `경기일정 수집 실패(건너뜀): ${season}-${month} ${seriesName} — ${String(err)}`,
            );
          }
          // ⚠️ 요청 간격 10초 이상 (CLAUDE.md 불변식).
          await sleep(REQUEST_DELAY_MS);
        }
      }
    } catch (err) {
      this.logger.error(`경기일정 크롤링 오류(부분 결과 반환): ${String(err)}`);
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }

    return results;
  }

  /**
   * 팀순위 크롤링 (단일 페이지). 정규시즌 기준.
   * @returns 파싱된 팀 기록 행들(부분 결과 가능)
   */
  async scrapeTeamRank(
    season: number,
    seriesName: SeriesTypeName = 'REGULAR_SEASON',
  ): Promise<TeamSeasonRecordRow[]> {
    let browser: Browser | null = null;
    try {
      browser = await this.launchBrowser();
      if (!browser) {
        this.logger.warn('Playwright 로드 실패 — 팀순위 크롤링 생략');
        return [];
      }
      const page = await browser.newPage();
      await page.goto(TEAM_RANK_URL, { waitUntil: 'networkidle' });

      const series = getSeriesType(seriesName);
      await page.selectOption(TEAM_RANK_SELECTORS.year, `${season}`);
      await page.waitForLoadState('networkidle');
      await page.selectOption(TEAM_RANK_SELECTORS.series, series.code);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector(TEAM_RANK_SELECTORS.rankTable);

      const html = await page
        .locator(TEAM_RANK_SELECTORS.rankTable)
        .evaluate((el: { outerHTML: string }) => el.outerHTML);
      const rows = parseTeamSeasonRecord(html, season);
      this.logger.log(`팀순위 수집: ${season} → ${rows.length}팀`);
      // 단일 요청이지만 일관성 위해 간격 유지.
      await sleep(REQUEST_DELAY_MS);
      return rows;
    } catch (err) {
      this.logger.error(`팀순위 크롤링 오류(빈 결과 반환): ${String(err)}`);
      return [];
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }

  /** 경기일정 드롭다운 선택 + 각 선택 후 갱신 대기 */
  private async selectScheduleDropdowns(
    page: Page,
    season: number,
    month: number,
    seriesCode: string,
  ): Promise<void> {
    await page.selectOption(SCHEDULE_SELECTORS.year, `${season}`);
    await page.waitForLoadState('networkidle');
    await page.selectOption(
      SCHEDULE_SELECTORS.month,
      String(month).padStart(2, '0'),
    );
    await page.waitForLoadState('networkidle');
    await page.selectOption(SCHEDULE_SELECTORS.series, seriesCode);
    await page.waitForLoadState('networkidle');
  }

  /**
   * Playwright chromium 브라우저 실행 (headless). 동적 import 로 devDep 로드.
   * 미설치/로드 실패 시 null 반환(graceful degradation).
   */
  private async launchBrowser(): Promise<Browser | null> {
    try {
      const { chromium } = await import('playwright');
      return await chromium.launch({ headless: true });
    } catch (err) {
      this.logger.error(`Playwright 브라우저 실행 실패: ${String(err)}`);
      return null;
    }
  }
}
