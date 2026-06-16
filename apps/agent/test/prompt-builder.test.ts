import { describe, it, expect } from 'vitest';
import {
  buildReactionPrompt,
  resolveTeamPersona,
  CANNED_REACTION_HANWHA,
} from '../src/utils/prompt-builder';

describe('PromptBuilder.buildReactionPrompt — XML 블록 구조 (§9.1)', () => {
  const prompt = buildReactionPrompt({
    teamId: 'hanwha',
    scoreSummary: '롯데 5 : 두산 3, 7회말',
    userMessage: '오늘 경기 어때?',
  });

  it('system_base(priority=1, immutable) 블록 포함', () => {
    expect(prompt).toContain('<system_base priority="1" immutable="true">');
    expect(prompt).toContain('</system_base>');
  });

  it('system_base 에 ChildSafety 지시 포함', () => {
    expect(prompt).toContain('전 연령 대상 서비스');
  });

  it('system_base 에 "숫자 언급 금지" 지시 강하게 포함', () => {
    expect(prompt).toContain('숫자는 절대 언급하지 마라');
    expect(prompt).toContain('한 글자도 쓰지 마라');
  });

  it('team_persona(priority=4) + hanwha 페르소나 포함', () => {
    expect(prompt).toContain('<team_persona priority="4">');
    expect(prompt).toContain('<team>hanwha</team>');
    expect(prompt).toContain('충청 사투리');
    // 한화 톤 사투리 어미
    expect(prompt).toMatch(/~유|그려|괜찮을 거여/);
  });

  it('current_situation 블록 — game(scoreSummary) + user_message', () => {
    expect(prompt).toContain('<current_situation>');
    expect(prompt).toContain('<game>롯데 5 : 두산 3, 7회말</game>');
    expect(prompt).toContain('<user_message>오늘 경기 어때?</user_message>');
  });

  it('priority_rules 블록 포함', () => {
    expect(prompt).toContain('<priority_rules>');
  });

  it('한화 자학/비하 금지 지시 포함', () => {
    expect(prompt).toContain('자학');
  });
});

describe('PromptBuilder.resolveTeamPersona — 폴백', () => {
  it('hanwha → hanwha 페르소나', () => {
    expect(resolveTeamPersona('hanwha').team).toBe('hanwha');
  });

  it('미구현 팀(lotte) → hanwha 폴백 (W6 중립)', () => {
    expect(resolveTeamPersona('lotte').team).toBe('hanwha');
  });

  it('undefined → hanwha 폴백', () => {
    expect(resolveTeamPersona(undefined).team).toBe('hanwha');
  });
});

describe('PromptBuilder.CANNED_REACTION_HANWHA — 수치 미포함', () => {
  it('캔드 리액션에 숫자가 없다', () => {
    expect(CANNED_REACTION_HANWHA).not.toMatch(/[0-9]/);
  });
  it('한화 사투리 톤', () => {
    expect(CANNED_REACTION_HANWHA).toMatch(/유|여/);
  });
});
