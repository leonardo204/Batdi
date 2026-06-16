/**
 * kbo-writer.ts — 파싱 결과 Prisma 영속화 (upsert).
 *
 * KboGameWriter / TeamRecordWriter: 각각 kbo_games / team_season_records 에 upsert.
 * update 시에는 변경 가능 필드만 갱신한다(키/시즌/대진은 불변).
 * PrismaService(@Global)를 주입받아 사용한다.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { KboGameRow, TeamSeasonRecordRow } from './kbo-parser';

/** upsert 결과 요약 */
export interface WriteResult {
  /** 입력으로 들어온 행 수 */
  collected: number;
  /** 신규 생성된 행 수 */
  saved: number;
  /** 기존 행 중 갱신된 수 */
  modified: number;
}

@Injectable()
export class KboGameWriter {
  private readonly logger = new Logger(KboGameWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 경기 행들을 upsert. gameKey 존재 여부로 created/updated 를 구분한다.
   * update 는 변경 가능 필드(gameTime/scores/stadium/relay/gameStatus/cancellationReason)만.
   */
  async write(rows: KboGameRow[]): Promise<WriteResult> {
    let saved = 0;
    let modified = 0;

    for (const row of rows) {
      const existing = await this.prisma.kboGame.findUnique({
        where: { gameKey: row.gameKey },
        select: { gameKey: true },
      });

      await this.prisma.kboGame.upsert({
        where: { gameKey: row.gameKey },
        create: {
          gameKey: row.gameKey,
          season: row.season,
          seriesType: row.seriesType,
          date: new Date(row.date),
          gameTime: row.gameTime,
          awayTeam: row.awayTeam,
          homeTeam: row.homeTeam,
          awayScore: row.awayScore,
          homeScore: row.homeScore,
          relay: row.relay,
          stadium: row.stadium,
          gameStatus: row.gameStatus,
          cancellationReason: row.cancellationReason,
        },
        update: {
          // 변경 가능 필드만 갱신 (대진/시즌/날짜/키는 불변).
          gameTime: row.gameTime,
          awayScore: row.awayScore,
          homeScore: row.homeScore,
          relay: row.relay,
          stadium: row.stadium,
          gameStatus: row.gameStatus,
          cancellationReason: row.cancellationReason,
        },
      });

      if (existing) {
        modified += 1;
      } else {
        saved += 1;
      }
    }

    const result: WriteResult = { collected: rows.length, saved, modified };
    this.logger.log(
      `kbo_games upsert: collected=${result.collected} saved=${result.saved} modified=${result.modified}`,
    );
    return result;
  }
}

@Injectable()
export class TeamRecordWriter {
  private readonly logger = new Logger(TeamRecordWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 팀 시즌 기록을 (season, team) 자연키로 upsert.
   */
  async write(rows: TeamSeasonRecordRow[]): Promise<WriteResult> {
    let saved = 0;
    let modified = 0;

    for (const row of rows) {
      const existing = await this.prisma.teamSeasonRecord.findUnique({
        where: { season_team: { season: row.season, team: row.team } },
        select: { team: true },
      });

      await this.prisma.teamSeasonRecord.upsert({
        where: { season_team: { season: row.season, team: row.team } },
        create: {
          season: row.season,
          team: row.team,
          teamRank: row.teamRank,
          gamesPlayed: row.gamesPlayed,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          winRate: row.winRate,
          gamesBehind: row.gamesBehind,
          recent10Games: row.recent10Games,
          streak: row.streak,
        },
        update: {
          teamRank: row.teamRank,
          gamesPlayed: row.gamesPlayed,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          winRate: row.winRate,
          gamesBehind: row.gamesBehind,
          recent10Games: row.recent10Games,
          streak: row.streak,
        },
      });

      if (existing) {
        modified += 1;
      } else {
        saved += 1;
      }
    }

    const result: WriteResult = { collected: rows.length, saved, modified };
    this.logger.log(
      `team_season_records upsert: collected=${result.collected} saved=${result.saved} modified=${result.modified}`,
    );
    return result;
  }
}
