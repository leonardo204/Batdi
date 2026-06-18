/**
 * push-triggers.ts — 푸시 트리거 4종 순수 결정 함수 (P4-W11 — ADR-055).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-055), development-plan W11 11.2.
 *
 * 각 함수는 **부수효과 없는 순수 함수**다(DB·전송 없음). 입력 상태를 받아 PushPayload 또는
 * null(알림 불필요)을 반환한다. 결정 로직 단위테스트가 W11 의 DoD.
 *
 * 실 이벤트 배선(잔여):
 *  - gameStartSoon: PushScheduler cron 이 kbo_games 를 스윕해 호출(이 파일 외부).
 *  - leadChange / favoritePlayerActive: 직전 score/stat 스냅샷 diff 가 필요 → 실시간 score·stat
 *    폴링 소스가 아직 없다(크롤/스케줄 통합 시 배선). 결정 함수만 우선 제공.
 *  - levelUp: agent(conversation-store).updateLevelProgress.leveledUp 이 소스이나 agent→api 직접
 *    호출은 경계 위반 → PushService.sendLevelUp 헬퍼 + 이 결정 함수까지 제공(실 이벤트 배선 잔여).
 */
import type { PushPayload } from './push.provider';

/** 경기 시작 알림 윈도우(분) — 시작 (30 ± WINDOW)분 전 범위에 들면 발송. */
export const GAME_START_LEAD_MINUTES = 30;
export const GAME_START_WINDOW_MINUTES = 5;

/** gameStartSoonTrigger 입력 — 경기 한 건의 최소 정보. */
export interface GameStartInput {
  /** 경기 시작 시각(epoch ms). */
  startAt: number;
  /** 표시용 매치업 라벨(예 "롯데 vs 두산"). */
  matchup: string;
}

/**
 * 경기 시작 30분 전(±윈도우) 트리거.
 *
 * now 기준 시작까지 남은 분이 [LEAD-WINDOW, LEAD+WINDOW] 범위면 payload, 아니면 null.
 * 이미 시작했거나(now >= startAt) 너무 이르면 null.
 *
 * @param game 경기 정보
 * @param now  현재 시각(epoch ms)
 */
export function gameStartSoonTrigger(
  game: GameStartInput,
  now: number,
): PushPayload | null {
  const minutesUntil = (game.startAt - now) / 60000;
  const lo = GAME_START_LEAD_MINUTES - GAME_START_WINDOW_MINUTES;
  const hi = GAME_START_LEAD_MINUTES + GAME_START_WINDOW_MINUTES;
  if (minutesUntil < lo || minutesUntil > hi) {
    return null;
  }
  return {
    title: '곧 경기 시작!',
    body: `${game.matchup} 경기가 약 ${GAME_START_LEAD_MINUTES}분 후 시작해. 준비됐어?`,
    url: '/chat',
    tag: 'game-start-soon',
  };
}

/** 경기 스코어 스냅샷(home/away). */
export interface ScoreSnapshot {
  home: number;
  away: number;
}

/**
 * 역전 또는 동점 발생 트리거.
 *
 * 직전 스냅샷(prev)과 현재 스냅샷(cur)의 리드 부호를 비교한다.
 *  - 부호가 뒤집힘(역전) 또는 한쪽 리드 → 동점(0) 으로 변화 → payload.
 *  - 리드 상태 변화 없음(같은 부호 유지·점수만 증가) → null.
 *  - 첫 득점(0:0 → 1:0 등 prev 가 동점이고 cur 가 리드) 은 "리드 발생"이지 역전/동점이
 *    아니므로 null(역전/동점만 알린다).
 *
 * @param prev 직전 스코어
 * @param cur  현재 스코어
 */
export function leadChangeTrigger(
  prev: ScoreSnapshot,
  cur: ScoreSnapshot,
): PushPayload | null {
  const prevDiff = prev.home - prev.away;
  const curDiff = cur.home - cur.away;
  const prevSign = Math.sign(prevDiff);
  const curSign = Math.sign(curDiff);

  // 변화 없음.
  if (prevSign === curSign) {
    return null;
  }

  // 동점 발생: 한쪽이 리드하다가 동점이 됨(prev 리드 → cur 0).
  if (prevSign !== 0 && curSign === 0) {
    return {
      title: '동점!',
      body: `${cur.away} : ${cur.home} 동점이 됐어. 경기 다시 원점!`,
      url: '/chat',
      tag: 'lead-change-tie',
    };
  }

  // 역전 발생: 리드 부호가 반대로 뒤집힘(둘 다 0 아님).
  if (prevSign !== 0 && curSign !== 0) {
    return {
      title: '역전!',
      body: `${cur.away} : ${cur.home} 스코어가 뒤집혔어. 지금 봐야 해!`,
      url: '/chat',
      tag: 'lead-change-flip',
    };
  }

  // prev 동점 → cur 리드(첫 리드): 역전/동점 아님.
  return null;
}

/** 관심 선수 활약 이벤트(스탯 단위 사건). */
export interface StatEvent {
  /** 활약한 선수 id. */
  playerId: number;
  /** 선수명(알림 본문용). */
  playerName: string;
  /** 활약 종류(예 '홈런', '호투', '결승타'). */
  kind: string;
}

/**
 * 관심 선수 활약 트리거.
 *
 * statEvent.playerId 가 사용자의 관심 선수 집합(favoritePlayerIds)에 속하면 payload, 아니면 null.
 *
 * @param favoritePlayerIds 사용자의 관심 선수 id 목록
 * @param statEvent         감지된 활약 이벤트
 */
export function favoritePlayerActiveTrigger(
  favoritePlayerIds: readonly number[],
  statEvent: StatEvent,
): PushPayload | null {
  if (!favoritePlayerIds.includes(statEvent.playerId)) {
    return null;
  }
  return {
    title: `${statEvent.playerName} 활약 중!`,
    body: `${statEvent.playerName} 선수가 ${statEvent.kind}! 지금 확인해봐.`,
    url: '/chat',
    tag: 'favorite-player-active',
  };
}

/**
 * 레벨업 트리거.
 *
 * newLevel > prevLevel 이면 payload, 아니면(같거나 하락) null.
 *
 * @param prevLevel 직전 레벨
 * @param newLevel  새 레벨
 * @param levelName 새 레벨 이름(예 '내야석')
 */
export function levelUpTrigger(
  prevLevel: number,
  newLevel: number,
  levelName: string,
): PushPayload | null {
  if (newLevel <= prevLevel) {
    return null;
  }
  return {
    title: '레벨업!',
    body: `축하해! Lv${newLevel} ${levelName} 으로 올라섰어.`,
    url: '/my/level',
    tag: 'level-up',
  };
}
