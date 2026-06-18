/**
 * PushScheduler — 경기 시작 30분 전 푸시 cron 스윕 (P4-W11 — ADR-055).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-055), development-plan W11.
 *
 * @Cron('*\/10 * * * *', Asia/Seoul): 10분마다 오늘 예정(SCHEDULED) 경기를 스윕해
 *   gameStartSoonTrigger(시작 30±5분 전)에 걸리는 경기의 관련 사용자에게 푸시(best-effort).
 *
 * 환경 게이트: PUSH_ENABLED === 'true' 일 때만 동작(기본 비활성 — CI/테스트 푸시 방지).
 *   VAPID 미설정이면 PushService 가 자연히 no-op 이라 이중 안전.
 *
 * 관련 사용자: 경기 두 팀(home/away) 중 하나를 응원하는 users(teamId 매칭). 팀팬 대상으로
 *   sendToUser 를 순차 호출한다(소규모 MVP — 대량화 시 배치/큐 필요, 잔여).
 *
 * 실 이벤트 배선(잔여): 역전/동점(leadChange)·관심선수 활약(favoritePlayerActive)은 실시간
 *   score/stat 폴링 소스가 필요해 본 스케줄러에서 배선하지 않는다(결정 함수만 제공).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { gameStartSoonTrigger } from './push-triggers';
import { PushService } from './push.service';

/** 푸시 cron 스윕 활성 게이트 환경변수. */
export const PUSH_ENABLED_ENV = 'PUSH_ENABLED';

/** 한 스윕에서 처리할 최대 사용자 수(과부하 방지). */
export const PUSH_SWEEP_USER_TAKE = 500;

/** 팀 코드 → 표시명(매치업 라벨용). 미등록 코드는 코드 그대로 사용. */
const TEAM_LABELS: Readonly<Record<string, string>> = {
  lotte: '롯데',
  doosan: '두산',
  kia: '기아',
  hanwha: '한화',
};

function teamLabel(code: string): string {
  return TEAM_LABELS[code] ?? code;
}

@Injectable()
export class PushScheduler {
  private readonly logger = new Logger(PushScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** 스윕 활성 여부 — PUSH_ENABLED === 'true' 일 때만 동작. */
  private isEnabled(): boolean {
    return process.env[PUSH_ENABLED_ENV] === 'true';
  }

  /**
   * 오늘 SCHEDULED 경기를 스윕해 시작 30분 전 경기에 대해 팀팬에게 푸시.
   */
  @Cron('*/10 * * * *', { timeZone: 'Asia/Seoul' })
  async runGameStartSweep(): Promise<void> {
    if (!this.isEnabled() || !this.push.isEnabled()) {
      return;
    }

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    let games: {
      gameKey: string;
      date: Date;
      gameTime: string | null;
      homeTeam: string;
      awayTeam: string;
    }[];
    try {
      games = await this.prisma.kboGame.findMany({
        where: {
          gameStatus: 'SCHEDULED',
          date: { gte: dayStart, lt: dayEnd },
        },
        select: {
          gameKey: true,
          date: true,
          gameTime: true,
          homeTeam: true,
          awayTeam: true,
        },
      });
    } catch (err) {
      this.logger.error(`경기 조회 실패: ${String(err)}`);
      return;
    }

    for (const game of games) {
      const startAt = this.resolveStartAt(game.date, game.gameTime);
      if (startAt === null) {
        continue;
      }
      const matchup = `${teamLabel(game.awayTeam)} vs ${teamLabel(game.homeTeam)}`;
      const payload = gameStartSoonTrigger({ startAt, matchup }, now.getTime());
      if (!payload) {
        continue;
      }
      await this.notifyTeamFans([game.homeTeam, game.awayTeam], payload.title, payload);
    }
  }

  /**
   * 경기 date(자정 기준)와 gameTime("HH:mm")으로 시작 epoch ms 산정.
   * gameTime 누락/형식 오류 시 null(스킵).
   */
  private resolveStartAt(date: Date, gameTime: string | null): number | null {
    if (!gameTime) {
      return null;
    }
    const match = /^(\d{1,2}):(\d{2})$/.exec(gameTime);
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const start = new Date(date);
    start.setHours(hours, minutes, 0, 0);
    return start.getTime();
  }

  /**
   * 두 팀 중 하나를 응원하는 사용자에게 푸시(best-effort, 순차).
   */
  private async notifyTeamFans(
    teamCodes: string[],
    _label: string,
    payload: Parameters<PushService['sendToUser']>[1],
  ): Promise<void> {
    let users: { id: string }[];
    try {
      users = await this.prisma.user.findMany({
        where: { teamId: { in: teamCodes } },
        select: { id: true },
        take: PUSH_SWEEP_USER_TAKE,
      });
    } catch (err) {
      this.logger.warn(`팀팬 조회 실패: ${String(err)}`);
      return;
    }

    for (const user of users) {
      try {
        await this.push.sendToUser(user.id, payload);
      } catch (err) {
        this.logger.warn(`푸시 전송 실패(${user.id}): ${String(err)}`);
      }
    }
  }
}
