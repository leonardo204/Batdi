/**
 * daily-kbo.scheduler.ts — KBO 일일 크롤링 스케줄러.
 *
 * - @Cron('0 4 * * *', Asia/Seoul): 매일 04:00 KST 당월+익월 경기일정(전 시리즈) + 팀순위 크롤링·upsert.
 * - OnApplicationBootstrap: 현재 시즌 kbo_games count==0 이면 전체 시즌 백필(3~11월 전 시리즈)
 *   을 비동기(fire-and-forget) 실행 — 부팅 블로킹 금지. count>0 이면 백필 생략 로깅.
 *
 * ⚠️ 온디맨드 크롤링 엔드포인트는 절대 만들지 않는다(컨트롤러 없음, 스케줄러만).
 * ⚠️ KBO_CRAWLER_ENABLED 가 'true' 가 아니면 스케줄러/백필 전부 no-op + 로깅
 *    (테스트/CI/로컬 부팅 시 실수로 크롤 안 하도록 기본 비활성).
 */

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CRAWLER_ENABLED_ENV,
  PLAYER_STAT_TEAM_IDS,
  SEASON_END_MONTH,
  SEASON_START_MONTH,
} from './kbo.constants';
import { PrismaService } from '../prisma/prisma.service';
import { KboScraper } from './kbo-scraper';
import { KboGameWriter, PlayerStatWriter, TeamRecordWriter } from './kbo-writer';
import type { HitterStatRow, PitcherStatRow } from './kbo-parser';
import { SERIES_TYPES, type SeriesTypeName } from './kbo-teams';

@Injectable()
export class DailyKboScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(DailyKboScheduler.name);

  constructor(
    private readonly scraper: KboScraper,
    private readonly gameWriter: KboGameWriter,
    private readonly recordWriter: TeamRecordWriter,
    private readonly playerStatWriter: PlayerStatWriter,
    private readonly prisma: PrismaService,
  ) {}

  /** 크롤러 활성 여부 — KBO_CRAWLER_ENABLED === 'true' 일 때만 동작. */
  private isEnabled(): boolean {
    return process.env[CRAWLER_ENABLED_ENV] === 'true';
  }

  /** 전 시리즈 이름 목록 */
  private allSeriesNames(): SeriesTypeName[] {
    return SERIES_TYPES.map((s) => s.name);
  }

  /**
   * 선수 기본 스탯(타자·투수) 크롤·upsert (P3-W7 7.3a).
   * 우선 4팀(한화·두산·KIA·롯데) 순차 크롤. best-effort — 오류 흡수.
   * 타입 단언: scrapePlayerStats 반환은 kind 에 맞는 Row 타입이다.
   */
  private async crawlPlayerStats(season: number): Promise<void> {
    const teamIds = [...PLAYER_STAT_TEAM_IDS];

    const hitters = (await this.scraper.scrapePlayerStats(
      season,
      'hitter',
      teamIds,
    )) as HitterStatRow[];
    await this.playerStatWriter.writeHitterStats(hitters);

    const pitchers = (await this.scraper.scrapePlayerStats(
      season,
      'pitcher',
      teamIds,
    )) as PitcherStatRow[];
    await this.playerStatWriter.writePitcherStats(pitchers);
  }

  /**
   * 매일 04:00 KST — 당월 + 익월 경기일정(전 시리즈) + 팀순위 크롤링·upsert.
   */
  @Cron('0 4 * * *', { timeZone: 'Asia/Seoul' })
  async runDaily(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.log(
        `${CRAWLER_ENABLED_ENV} != 'true' — 일일 크롤링 생략(no-op)`,
      );
      return;
    }

    const now = new Date();
    const season = now.getFullYear();
    const thisMonth = now.getMonth() + 1; // 1~12
    const nextMonth = thisMonth === 12 ? 12 : thisMonth + 1;
    const months = Array.from(new Set([thisMonth, nextMonth]));

    this.logger.log(
      `일일 KBO 크롤링 시작: season=${season} months=[${months.join(',')}] 전 시리즈`,
    );

    try {
      const games = await this.scraper.scrapeSchedule(
        season,
        months,
        this.allSeriesNames(),
      );
      await this.gameWriter.write(games);

      const records = await this.scraper.scrapeTeamRank(season);
      await this.recordWriter.write(records);

      // 선수 기본 스탯(타자·투수, 우선 4팀) — 일정·순위 크롤 뒤에.
      await this.crawlPlayerStats(season);

      this.logger.log('일일 KBO 크롤링 완료');
    } catch (err) {
      // best-effort — 스케줄러는 throw 하지 않는다.
      this.logger.error(`일일 KBO 크롤링 오류: ${String(err)}`);
    }
  }

  /**
   * 부팅 시: 현재 시즌 데이터가 비어있으면 전체 시즌 백필을 비동기 실행.
   * 부팅을 블로킹하지 않도록 await 하지 않고 fire-and-forget 한다.
   */
  onApplicationBootstrap(): void {
    if (!this.isEnabled()) {
      this.logger.log(
        `${CRAWLER_ENABLED_ENV} != 'true' — 부팅 백필 생략(no-op)`,
      );
      return;
    }

    // fire-and-forget: 부팅 블로킹 금지. 내부에서 모든 오류를 흡수한다.
    void this.maybeBackfill();
  }

  /** count==0 이면 전체 시즌 백필, count>0 이면 생략. */
  private async maybeBackfill(): Promise<void> {
    const season = new Date().getFullYear();
    try {
      const count = await this.prisma.kboGame.count({
        where: { season },
      });
      if (count > 0) {
        this.logger.log(
          `시즌 ${season} kbo_games 이미 존재(${count}건) — 백필 생략`,
        );
        return;
      }

      this.logger.log(`시즌 ${season} 데이터 없음 — 전체 시즌 백필 시작(비동기)`);
      const months: number[] = [];
      for (let m = SEASON_START_MONTH; m <= SEASON_END_MONTH; m += 1) {
        months.push(m);
      }
      const games = await this.scraper.scrapeSchedule(
        season,
        months,
        this.allSeriesNames(),
      );
      await this.gameWriter.write(games);

      const records = await this.scraper.scrapeTeamRank(season);
      await this.recordWriter.write(records);

      // 선수 기본 스탯(타자·투수, 우선 4팀) — 일정·순위 백필 뒤에.
      await this.crawlPlayerStats(season);

      this.logger.log(`시즌 ${season} 백필 완료`);
    } catch (err) {
      this.logger.error(`시즌 ${season} 백필 오류: ${String(err)}`);
    }
  }
}
