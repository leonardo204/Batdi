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

  it('뉴스/일정/라인업/밈 분류', () => {
    expect(classifyIntent(norm('오늘 뉴스 있어')).intent).toBe('news');
    expect(classifyIntent(norm('다음 경기 언제야')).intent).toBe('schedule');
    expect(classifyIntent(norm('오늘 선발 누구야')).intent).toBe('lineup');
    expect(classifyIntent(norm('웃긴 거 보여줘')).intent).toBe('meme');
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
  });
});
