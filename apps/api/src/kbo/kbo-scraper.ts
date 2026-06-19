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
  GAMECENTER_SELECTORS,
  GAMECENTER_URL,
  HITTER_BASIC_URL,
  PITCHER_BASIC_URL,
  PLAYER_STAT_SELECTORS,
  PLAYER_TEAM_CODE,
  REQUEST_DELAY_MS,
  SCHEDULE_SELECTORS,
  SCHEDULE_URL,
  TEAM_RANK_SELECTORS,
  TEAM_RANK_URL,
} from './kbo.constants';
import {
  parseGameSchedule,
  parseHeadToHead,
  parseHitterBasic,
  parseLineups,
  parsePitcherBasic,
  parseTeamSeasonRecord,
} from './kbo-parser';
import type {
  GameLineupRow,
  HitterStatRow,
  KboGameRow,
  PitcherStatRow,
  TeamHeadToHeadRow,
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
      // 팀순위도 동일한 UpdatePanel 갱신 — 옛 테이블 detach 대기로 stale read 방지.
      await this.selectAndWaitForTableReload(
        page,
        TEAM_RANK_SELECTORS.year,
        `${season}`,
        TEAM_RANK_SELECTORS.rankTable,
      );
      await this.selectAndWaitForTableReload(
        page,
        TEAM_RANK_SELECTORS.series,
        series.teamRankCode, // ⚠️ 팀순위 페이지 전용 코드(정규=0). 일정 코드(0,9,6) 아님.
        TEAM_RANK_SELECTORS.rankTable,
      );
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

  /**
   * 상대전적 매트릭스 크롤링 (TeamRank.aspx 동일 페이지의 pnlVsTeam 표, ADR-057).
   *
   * 순위 표(scrapeTeamRank)와 같은 페이지지만 별개 table(pnlVsTeam) 이라 독립 health 게이트로
   * 1회 더 로드한다(드롭다운 시즌 선택 후 매트릭스 표 outerHTML 추출). best-effort —
   * 실패/미설치 시 빈 배열 반환(graceful degradation).
   *
   * @param season 시즌(연도)
   * @returns 파싱된 상대전적 쌍 행들(부분/빈 결과 가능)
   */
  async scrapeHeadToHead(season: number): Promise<TeamHeadToHeadRow[]> {
    let browser: Browser | null = null;
    try {
      browser = await this.launchBrowser();
      if (!browser) {
        this.logger.warn('Playwright 로드 실패 — 상대전적 크롤링 생략');
        return [];
      }
      const page = await browser.newPage();
      await page.goto(TEAM_RANK_URL, { waitUntil: 'networkidle' });

      // 시즌 드롭다운 선택 후 매트릭스 표 갱신 대기(순위 표와 동일 UpdatePanel).
      await this.selectAndWaitForTableReload(
        page,
        TEAM_RANK_SELECTORS.year,
        `${season}`,
        TEAM_RANK_SELECTORS.vsTeamTable,
      );
      await page.waitForSelector(TEAM_RANK_SELECTORS.vsTeamTable);

      const html = await page
        .locator(TEAM_RANK_SELECTORS.vsTeamTable)
        .evaluate((el: { outerHTML: string }) => el.outerHTML);
      const rows = parseHeadToHead(html, season);
      this.logger.log(`상대전적 수집: ${season} → ${rows.length}쌍`);
      await sleep(REQUEST_DELAY_MS);
      return rows;
    } catch (err) {
      this.logger.error(`상대전적 크롤링 오류(빈 결과 반환): ${String(err)}`);
      return [];
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }

  /**
   * GameCenter 당일 경기 선발투수 라인업 크롤링 (단일 페이지, ADR-056).
   *
   * robots.txt 허용 경로(/Schedule/). 단일 페이지 1회 로드라 드롭다운/추가 네비게이션이
   * 없다 → 페이지 내 10초 sleep 불필요(요청 1회). 다만 호출부(daily-kbo.scheduler)에서
   * withHealthGate('lineup', ...) 로 게이트한다.
   *
   * networkidle 후 game-cont 등장 대기 → 전체 페이지 HTML 을 parseLineups 에 넘긴다.
   * best-effort: 실패해도 throw 하지 않고 빈 배열 반환(graceful degradation).
   *
   * @returns 파싱된 경기 라인업 행들(부분/빈 결과 가능)
   */
  async scrapeLineups(): Promise<GameLineupRow[]> {
    let browser: Browser | null = null;
    try {
      browser = await this.launchBrowser();
      if (!browser) {
        this.logger.warn('Playwright 로드 실패 — 라인업 크롤링 생략');
        return [];
      }
      const page = await browser.newPage();
      await page.goto(GAMECENTER_URL, { waitUntil: 'networkidle' });
      // game-cont 등장 대기(없으면 타임아웃 → catch 로 빈 배열).
      await page
        .waitForSelector(GAMECENTER_SELECTORS.ready, { timeout: 15_000 })
        .catch(() => undefined);

      const html = await page.content();
      const rows = parseLineups(html);
      this.logger.log(`라인업 수집: GameCenter → ${rows.length}경기`);
      return rows;
    } catch (err) {
      this.logger.error(`라인업 크롤링 오류(빈 결과 반환): ${String(err)}`);
      return [];
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }

  /**
   * 선수 기본 스탯 크롤링 (타자/투수, P3-W7 7.3a).
   *
   * 단일 페이지(타자 or 투수)에서 우선 4팀을 순차로 팀 드롭다운 선택하며 추출한다.
   * ⚠️ 순차(동시 1) — for...of teamIds, 각 팀 조합 추출 후 sleep(REQUEST_DELAY_MS=10초).
   *   robots.txt 준수(/Record/ 허용). best-effort: 실패 팀은 skip + 로깅(부분 결과).
   *
   * @param season 시즌(연도)
   * @param kind 'hitter' | 'pitcher'
   * @param teamIds 내부 팀 코드 목록(PLAYER_TEAM_CODE 키, 우선 4팀)
   * @returns 파싱된 스탯 행들(타자면 HitterStatRow[], 투수면 PitcherStatRow[]) — 부분 결과 가능
   */
  async scrapePlayerStats(
    season: number,
    kind: 'hitter' | 'pitcher',
    teamIds: string[],
  ): Promise<(HitterStatRow | PitcherStatRow)[]> {
    const results: (HitterStatRow | PitcherStatRow)[] = [];
    let browser: Browser | null = null;

    try {
      browser = await this.launchBrowser();
      if (!browser) {
        this.logger.warn(`Playwright 로드 실패 — 선수 스탯(${kind}) 크롤링 생략`);
        return results;
      }
      const url = kind === 'hitter' ? HITTER_BASIC_URL : PITCHER_BASIC_URL;
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });

      // ⚠️ 순차 처리(동시 1) — 우선 4팀을 for...of 로 하나씩, 각 팀 후 10초 대기.
      for (const teamId of teamIds) {
        const teamCode = PLAYER_TEAM_CODE[teamId];
        if (!teamCode) {
          this.logger.warn(`선수 스탯 팀코드 미정의(건너뜀): ${teamId}`);
          continue;
        }
        try {
          // 시즌 → 팀 순서로 드롭다운 선택. 각 선택마다 tData01 갱신 대기(stale read 방지).
          await this.selectAndWaitForTableReload(
            page,
            PLAYER_STAT_SELECTORS.season,
            `${season}`,
            PLAYER_STAT_SELECTORS.table,
          );
          await this.selectAndWaitForTableReload(
            page,
            PLAYER_STAT_SELECTORS.team,
            teamCode,
            PLAYER_STAT_SELECTORS.table,
          );
          await page.waitForSelector(PLAYER_STAT_SELECTORS.table);

          const html = await page
            .locator(PLAYER_STAT_SELECTORS.table)
            .first()
            .evaluate((el: { outerHTML: string }) => el.outerHTML);
          const rows =
            kind === 'hitter'
              ? parseHitterBasic(html, season, teamId)
              : parsePitcherBasic(html, season, teamId);
          results.push(...rows);
          this.logger.log(
            `선수 스탯(${kind}) 수집: ${season} ${teamId}(${teamCode}) → ${rows.length}명`,
          );
        } catch (err) {
          // best-effort: 한 팀 실패는 건너뛰고 계속.
          this.logger.warn(
            `선수 스탯(${kind}) 수집 실패(건너뜀): ${season} ${teamId} — ${String(err)}`,
          );
        }
        // ⚠️ 요청 간격 10초 이상 (CLAUDE.md 불변식).
        await sleep(REQUEST_DELAY_MS);
      }
    } catch (err) {
      this.logger.error(
        `선수 스탯(${kind}) 크롤링 오류(부분 결과 반환): ${String(err)}`,
      );
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }

    return results;
  }

  /** 경기일정 드롭다운 선택 + 각 선택 후 갱신 대기 */
  private async selectScheduleDropdowns(
    page: Page,
    season: number,
    month: number,
    seriesCode: string,
  ): Promise<void> {
    // ⚠️ 각 select 마다 ASP.NET UpdatePanel 부분 포스트백이 테이블을 교체한다.
    //   networkidle 은 교체 전에 resolve 돼 stale/빈 테이블을 읽는 버그가 있었다(실측 0건).
    //   → 선택 직전 테이블 핸들을 잡고 그 핸들이 detach 될 때까지 기다린다(레퍼런스
    //     selectOptionAndWaitForDomChange 방식). 순서대로(year→month→series) 적용.
    await this.selectAndWaitForTableReload(
      page,
      SCHEDULE_SELECTORS.year,
      `${season}`,
      SCHEDULE_SELECTORS.gamesTable,
    );
    await this.selectAndWaitForTableReload(
      page,
      SCHEDULE_SELECTORS.month,
      String(month).padStart(2, '0'),
      SCHEDULE_SELECTORS.gamesTable,
    );
    await this.selectAndWaitForTableReload(
      page,
      SCHEDULE_SELECTORS.series,
      seriesCode,
      SCHEDULE_SELECTORS.gamesTable,
    );
  }

  /**
   * 드롭다운 선택 후 대상 테이블이 갱신될 때까지 대기한다(ASP.NET UpdatePanel 대응).
   *
   * 갱신 전 테이블 elementHandle 을 확보 → selectOption → 그 핸들이 detach(hidden)될
   * 때까지 대기(부분 포스트백이 tbody 를 교체하면 옛 핸들이 사라진다). 타임아웃/예외는
   * networkidle + 짧은 settle 로 폴백한다(graceful). 새 테이블 등장은 호출부 waitForSelector 가 보장.
   */
  private async selectAndWaitForTableReload(
    page: Page,
    selector: string,
    value: string,
    tableSelector: string,
  ): Promise<void> {
    const oldHandle = await page.$(tableSelector);
    await page.selectOption(selector, value);
    if (oldHandle) {
      await oldHandle
        .waitForElementState('hidden', { timeout: 10_000 })
        .catch(() => undefined);
    }
    await page.waitForLoadState('networkidle').catch(() => undefined);
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
