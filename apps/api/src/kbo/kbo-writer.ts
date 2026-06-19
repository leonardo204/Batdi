/**
 * kbo-writer.ts — 파싱 결과 Prisma 영속화 (upsert).
 *
 * KboGameWriter / TeamRecordWriter: 각각 kbo_games / team_season_records 에 upsert.
 * update 시에는 변경 가능 필드만 갱신한다(키/시즌/대진은 불변).
 * PrismaService(@Global)를 주입받아 사용한다.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  GameLineupRow,
  HitterStatRow,
  KboGameRow,
  PitcherStatRow,
  TeamHeadToHeadRow,
  TeamSeasonRecordRow,
} from './kbo-parser';

/** upsert 결과 요약 */
export interface WriteResult {
  /** 입력으로 들어온 행 수 */
  collected: number;
  /** 신규 생성된 행 수 */
  saved: number;
  /** 기존 행 중 갱신된 수 */
  modified: number;
}

/** 선수 스탯 write 결과 요약 */
export interface PlayerStatWriteResult {
  /** 입력으로 들어온 스탯 행 수 */
  collected: number;
  /** 신규 생성된 Player 수 */
  players: number;
  /** upsert 된 스탯 행 수 */
  stats: number;
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

/**
 * H2HWriter — 상대전적 매트릭스(TeamHeadToHeadRow) Prisma 영속화 (ADR-057).
 *
 * (season, teamId, opponentId) 자연키로 team_head_to_head 에 upsert. opponentId 가 nullable 이라
 * Postgres UNIQUE 가 NULL 을 중복 허용하므로(표준 SQL), prisma.upsert 의 compound-unique where
 * 대신 findFirst → create/update 로 멱등성을 직접 보장한다(미지원 상대 null 행 중복 방지).
 * update 시에는 변경 가능 필드(wins/losses/draws/opponentName)만 갱신한다.
 */
@Injectable()
export class H2HWriter {
  private readonly logger = new Logger(H2HWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(rows: TeamHeadToHeadRow[]): Promise<WriteResult> {
    let saved = 0;
    let modified = 0;

    for (const row of rows) {
      const existing = await this.prisma.teamHeadToHead.findFirst({
        where: {
          season: row.season,
          teamId: row.teamId,
          opponentId: row.opponentId,
        },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.teamHeadToHead.update({
          where: { id: existing.id },
          data: {
            opponentName: row.opponentName,
            wins: row.wins,
            losses: row.losses,
            draws: row.draws,
          },
        });
        modified += 1;
      } else {
        await this.prisma.teamHeadToHead.create({
          data: {
            season: row.season,
            teamId: row.teamId,
            opponentId: row.opponentId,
            opponentName: row.opponentName,
            wins: row.wins,
            losses: row.losses,
            draws: row.draws,
          },
        });
        saved += 1;
      }
    }

    const result: WriteResult = { collected: rows.length, saved, modified };
    this.logger.log(
      `team_head_to_head upsert: collected=${result.collected} saved=${result.saved} modified=${result.modified}`,
    );
    return result;
  }
}

/**
 * PlayerStatWriter — 선수 기본 스탯(타자/투수) Prisma 영속화 (P3-W7 7.3a).
 *
 * 각 행마다 Player 를 (name, teamId) 로 findFirst → 없으면 create(position 미상).
 * 그 playerId 로 BattingStat/PitchingStat 을 (playerId, season) 복합 unique 로 upsert.
 * rawData 에 행 전체 td 텍스트 배열을 보존하고 source='kbo' 로 표기한다.
 *
 * ⚠️ Player findFirst+create 는 이론상 동시성 경합이 있으나, 일일 단일 스케줄 크롤(순차)
 *    이라 무시한다(병렬 쓰기 없음).
 */
@Injectable()
export class PlayerStatWriter {
  private readonly logger = new Logger(PlayerStatWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  /** (name, teamId) 로 Player 조회, 없으면 생성. [playerId, 신규생성여부] 반환. */
  private async ensurePlayer(
    name: string,
    teamId: string,
  ): Promise<{ playerId: number; created: boolean }> {
    const existing = await this.prisma.player.findFirst({
      where: { name, teamId },
      select: { id: true },
    });
    if (existing) {
      return { playerId: existing.id, created: false };
    }
    const created = await this.prisma.player.create({
      data: { name, teamId },
      select: { id: true },
    });
    return { playerId: created.id, created: true };
  }

  /** 타자 스탯 write — Player 보장 후 BattingStat upsert((playerId, season) unique). */
  async writeHitterStats(
    rows: HitterStatRow[],
  ): Promise<PlayerStatWriteResult> {
    let players = 0;
    let stats = 0;

    for (const row of rows) {
      const { playerId, created } = await this.ensurePlayer(
        row.name,
        row.teamId,
      );
      if (created) {
        players += 1;
      }

      await this.prisma.battingStat.upsert({
        where: { playerId_season: { playerId, season: row.season } },
        create: {
          playerId,
          season: row.season,
          teamId: row.teamId,
          games: row.games,
          avg: row.avg,
          hr: row.hr,
          rbi: row.rbi,
          rawData: row.raw,
          source: 'kbo',
        },
        update: {
          teamId: row.teamId,
          games: row.games,
          avg: row.avg,
          hr: row.hr,
          rbi: row.rbi,
          rawData: row.raw,
          source: 'kbo',
        },
      });
      stats += 1;
    }

    const result: PlayerStatWriteResult = {
      collected: rows.length,
      players,
      stats,
    };
    this.logger.log(
      `batting_stats upsert: collected=${result.collected} players=${result.players} stats=${result.stats}`,
    );
    return result;
  }

  /** 투수 스탯 write — Player 보장 후 PitchingStat upsert((playerId, season) unique). */
  async writePitcherStats(
    rows: PitcherStatRow[],
  ): Promise<PlayerStatWriteResult> {
    let players = 0;
    let stats = 0;

    for (const row of rows) {
      const { playerId, created } = await this.ensurePlayer(
        row.name,
        row.teamId,
      );
      if (created) {
        players += 1;
      }

      await this.prisma.pitchingStat.upsert({
        where: { playerId_season: { playerId, season: row.season } },
        create: {
          playerId,
          season: row.season,
          teamId: row.teamId,
          games: row.games,
          era: row.era,
          whip: row.whip,
          strikeouts: row.strikeouts,
          rawData: row.raw,
          source: 'kbo',
        },
        update: {
          teamId: row.teamId,
          games: row.games,
          era: row.era,
          whip: row.whip,
          strikeouts: row.strikeouts,
          rawData: row.raw,
          source: 'kbo',
        },
      });
      stats += 1;
    }

    const result: PlayerStatWriteResult = {
      collected: rows.length,
      players,
      stats,
    };
    this.logger.log(
      `pitching_stats upsert: collected=${result.collected} players=${result.players} stats=${result.stats}`,
    );
    return result;
  }
}

/**
 * LineupWriter — GameCenter 선발 라인업(GameLineupRow) Prisma 영속화 (ADR-056).
 *
 * gameKey(g_id) 자연키로 game_lineups 에 upsert. update 시에는 변경 가능 필드만 갱신한다
 * (선발투수/상태/시각은 경기 임박 시 갱신, 대진/날짜/팀은 사실상 불변이나 함께 set).
 * KboGameWriter 패턴 평행.
 */
@Injectable()
export class LineupWriter {
  private readonly logger = new Logger(LineupWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 라인업 행들을 gameKey 로 upsert. 기존 존재 여부로 created/updated 구분.
   * update 는 갱신 가능 필드(선발투수/상태/시각/구장/팀명·teamId)를 set.
   */
  async write(rows: GameLineupRow[]): Promise<WriteResult> {
    let saved = 0;
    let modified = 0;

    for (const row of rows) {
      const existing = await this.prisma.gameLineup.findUnique({
        where: { gameKey: row.gameKey },
        select: { gameKey: true },
      });

      await this.prisma.gameLineup.upsert({
        where: { gameKey: row.gameKey },
        create: {
          gameKey: row.gameKey,
          gameDate: new Date(row.gameDate),
          homeTeamId: row.homeTeamId,
          awayTeamId: row.awayTeamId,
          homeTeamName: row.homeTeamName,
          awayTeamName: row.awayTeamName,
          homeStarter: row.homeStarter,
          awayStarter: row.awayStarter,
          stadium: row.stadium,
          gameTime: row.gameTime,
          status: row.status,
        },
        update: {
          // 선발/상태/시각은 경기 임박 시 갱신될 수 있어 모두 set(키만 불변).
          gameDate: new Date(row.gameDate),
          homeTeamId: row.homeTeamId,
          awayTeamId: row.awayTeamId,
          homeTeamName: row.homeTeamName,
          awayTeamName: row.awayTeamName,
          homeStarter: row.homeStarter,
          awayStarter: row.awayStarter,
          stadium: row.stadium,
          gameTime: row.gameTime,
          status: row.status,
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
      `game_lineups upsert: collected=${result.collected} saved=${result.saved} modified=${result.modified}`,
    );
    return result;
  }
}
