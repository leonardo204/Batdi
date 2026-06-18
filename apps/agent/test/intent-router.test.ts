import { describe, it, expect } from 'vitest';
import {
  classifyIntent,
  intentRouter,
} from '../src/nodes/intent-router';
import { toNormalizedForm } from '../src/nodes/normalizer';
import type { CoreGraphState } from '../src/state';

/** 테스트 입력은 normalized form 기준 (소문자/NFKC) */
function norm(raw: string): string {
  return toNormalizedForm(raw);
}

describe('IntentRouter.classifyIntent', () => {
  it('"몇 대 몇이야" → score (high)', () => {
    const r = classifyIntent(norm('지금 몇 대 몇이야'));
    expect(r.intent).toBe('score');
    expect(r.confidence).toBe('high');
  });

  it('"스코어"/"점수"/"이기고 있어?" → score', () => {
    expect(classifyIntent(norm('스코어 알려줘')).intent).toBe('score');
    expect(classifyIntent(norm('점수 어때')).intent).toBe('score');
    expect(classifyIntent(norm('이기고 있어?')).intent).toBe('score');
  });

  it('"안녕" → chat (default, 미매칭 fallthrough)', () => {
    const r = classifyIntent(norm('안녕'));
    expect(r.intent).toBe('chat');
    expect(r.confidence).toBe('default');
  });

  it('순위/승률 → stats (standings 흡수)', () => {
    expect(classifyIntent(norm('우리 몇 위야')).intent).toBe('stats');
    expect(classifyIntent(norm('승률 얼마야')).intent).toBe('stats');
  });

  it('타율/방어율 → stats', () => {
    expect(classifyIntent(norm('타율 얼마야')).intent).toBe('stats');
    expect(classifyIntent(norm('방어율 ERA 알려줘')).intent).toBe('stats');
  });

  it('statType 분기: 순위→standings / 타율→player (P3-W7 7.3b)', () => {
    const standings = classifyIntent(norm('우리 순위 어때'));
    expect(standings.intent).toBe('stats');
    expect(standings.statType).toBe('standings');

    const player = classifyIntent(norm('타율 어때'));
    expect(player.intent).toBe('stats');
    expect(player.statType).toBe('player');

    const playerPit = classifyIntent(norm('방어율 알려줘'));
    expect(playerPit.intent).toBe('stats');
    expect(playerPit.statType).toBe('player');
  });

  it('비-stats 규칙(score)·chat 은 statType undefined', () => {
    expect(classifyIntent(norm('스코어 알려줘')).statType).toBeUndefined();
    expect(classifyIntent(norm('안녕')).statType).toBeUndefined();
  });

  it('뉴스/일정/라인업/밈 분류', () => {
    expect(classifyIntent(norm('오늘 뉴스 있어')).intent).toBe('news');
    expect(classifyIntent(norm('다음 경기 언제야')).intent).toBe('schedule');
    expect(classifyIntent(norm('오늘 선발 누구야')).intent).toBe('lineup');
    expect(classifyIntent(norm('웃긴 거 보여줘')).intent).toBe('meme');
  });
});

describe('IntentRouter — P2 키워드 보강 (결과·승패·팀별칭)', () => {
  it('"경기 결과"/"이겼어?"/"졌어"/"역전" → score (chat 오분류 해소)', () => {
    expect(classifyIntent(norm('엘지 경기 결과 알려줘')).intent).toBe('score');
    expect(classifyIntent(norm('어제 결과 어땠어')).intent).toBe('score');
    expect(classifyIntent(norm('이겼어?')).intent).toBe('score');
    expect(classifyIntent(norm('졌어?')).intent).toBe('score');
    expect(classifyIntent(norm('역전했어?')).intent).toBe('score');
  });

  it('팀 별칭 + 맥락어 → score', () => {
    expect(classifyIntent(norm('기아 어때')).intent).toBe('score');
    expect(classifyIntent(norm('한화 잘해?')).intent).toBe('score');
    expect(classifyIntent(norm('엘지 경기 어땠어')).intent).toBe('score');
    expect(classifyIntent(norm('롯데 어떻게 됐어')).intent).toBe('score');
  });

  it('팀명 단독은 chat (맥락어 없으면 score 아님)', () => {
    expect(classifyIntent(norm('나 한화 팬이야')).intent).toBe('chat');
    expect(classifyIntent(norm('기아')).intent).toBe('chat');
  });

  it('우선순위: 팀명+특정 intent 키워드는 특정 intent 가 이긴다', () => {
    // 순위(stats) > 팀맥락 score
    expect(classifyIntent(norm('기아 순위 어때')).intent).toBe('stats');
    // 뉴스 > 팀맥락 score
    expect(classifyIntent(norm('한화 뉴스 있어')).intent).toBe('news');
    // 일정 > 팀맥락 score
    expect(classifyIntent(norm('기아 다음 경기 언제야')).intent).toBe('schedule');
    // 선발(lineup)
    expect(classifyIntent(norm('한화 선발 누구야')).intent).toBe('lineup');
  });

  it('stats 보강: 게임차·연승·타점·성적', () => {
    expect(classifyIntent(norm('게임 차 얼마야')).intent).toBe('stats');
    expect(classifyIntent(norm('연승 중이야?')).intent).toBe('stats');
    expect(classifyIntent(norm('타점 순위')).intent).toBe('stats');
    expect(classifyIntent(norm('문동주 성적 어때')).intent).toBe('stats');
  });

  it('영문 약칭 팀별칭(lg/kia/nc/kt/ssg) + 맥락어 → score', () => {
    expect(classifyIntent(norm('LG 어때')).intent).toBe('score');
    expect(classifyIntent(norm('SSG 경기 어땠어')).intent).toBe('score');
  });
});

describe('IntentRouter node', () => {
  it('state.userMessageNormalized 기반 분류 + complexity=simple 고정', () => {
    const state = {
      userMessageNormalized: norm('지금 몇 대 몇이야'),
    } as CoreGraphState;
    const update = intentRouter(state);
    expect(update.intent).toBe('score');
    expect(update.intentConfidence).toBe('high');
    expect(update.complexity).toBe('simple');
    expect(update.statType).toBeUndefined(); // score 규칙은 statType 없음
  });

  it('intentRouter 가 stats statType 을 state update 로 노출', () => {
    const player = intentRouter({
      userMessageNormalized: norm('타율 어때'),
    } as CoreGraphState);
    expect(player.intent).toBe('stats');
    expect(player.statType).toBe('player');

    const standings = intentRouter({
      userMessageNormalized: norm('순위 어때'),
    } as CoreGraphState);
    expect(standings.intent).toBe('stats');
    expect(standings.statType).toBe('standings');
  });
});

describe('IntentRouter — P3-W9 9.1 composite 감지', () => {
  it('classifyIntent: 모든 매칭 intent 를 matchedIntents 로 수집(중복 제거, 대표=첫 매칭)', () => {
    const r = classifyIntent(norm('스코어랑 순위 같이 알려줘'));
    // 대표 intent 는 첫 매칭(score) — 기존 동작 보존.
    expect(r.intent).toBe('score');
    // score + stats 둘 다 수집.
    expect(r.matchedIntents).toContain('score');
    expect(r.matchedIntents).toContain('stats');
    expect(r.matchedIntents.length).toBeGreaterThanOrEqual(2);
  });

  it('classifyIntent: 단일 intent 는 matchedIntents 길이 1(회귀)', () => {
    const score = classifyIntent(norm('스코어 알려줘'));
    expect(score.matchedIntents).toEqual(['score']);

    const chat = classifyIntent(norm('안녕'));
    expect(chat.intent).toBe('chat');
    expect(chat.matchedIntents).toEqual([]); // 미매칭 → 빈 배열
  });

  it('intentRouter: "스코어랑 순위 같이" → complexity=composite + matchedIntents', () => {
    const update = intentRouter({
      userMessageNormalized: norm('스코어랑 순위 같이 알려줘'),
    } as CoreGraphState);
    expect(update.complexity).toBe('composite');
    expect(update.intent).toBe('score'); // 대표 intent
    expect(update.matchedIntents).toContain('score');
    expect(update.matchedIntents).toContain('stats');
  });

  it('intentRouter: 단일 "스코어" → complexity=simple(회귀, composite 아님)', () => {
    const update = intentRouter({
      userMessageNormalized: norm('스코어 알려줘'),
    } as CoreGraphState);
    expect(update.complexity).toBe('simple');
    expect(update.matchedIntents).toEqual(['score']);
  });

  it('intentRouter: 단일 "순위" → simple / 단일 chat("안녕") → general(회귀)', () => {
    const standings = intentRouter({
      userMessageNormalized: norm('순위 어때'),
    } as CoreGraphState);
    expect(standings.complexity).toBe('simple');

    const chat = intentRouter({
      userMessageNormalized: norm('안녕'),
    } as CoreGraphState);
    expect(chat.intent).toBe('chat');
    expect(chat.complexity).toBe('general');
  });
});
