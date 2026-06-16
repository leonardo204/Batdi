import { describe, it, expect } from 'vitest';
import {
  buildReactionPrompt,
  resolveTeamPersona,
  cannedReactionFor,
} from '../src/utils/prompt-builder';
import type { PersonalContext, TeamId } from '@batdi/types';
import { DEFAULT_PERSONAL_CONTEXT } from '../src/personal/personal-agent';

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

describe('PromptBuilder.resolveTeamPersona — W7 4팀 + 폴백', () => {
  const teams: TeamId[] = ['hanwha', 'doosan', 'kia', 'lotte'];
  it.each(teams)('%s → 자기 팀 페르소나(폴백 아님)', (team) => {
    expect(resolveTeamPersona(team).team).toBe(team);
  });

  it('undefined → hanwha 폴백', () => {
    expect(resolveTeamPersona(undefined).team).toBe('hanwha');
  });

  it('각 팀 본문은 서로 다르다(고유 페르소나)', () => {
    const bodies = teams.map((t) => resolveTeamPersona(t).body);
    expect(new Set(bodies).size).toBe(teams.length);
  });
});

describe('PromptBuilder.buildReactionPrompt — 팀별 말투 주입', () => {
  it('doosan → 서울말 여유 톤 + <team>doosan</team>', () => {
    const p = buildReactionPrompt({
      teamId: 'doosan',
      scoreSummary: '두산 0 : 0 키움',
      userMessage: '어때?',
    });
    expect(p).toContain('<team>doosan</team>');
    expect(p).toMatch(/가을|여유|괜찮지/);
  });

  it('kia → 전라도 사투리 + <team>kia</team>', () => {
    const p = buildReactionPrompt({
      teamId: 'kia',
      scoreSummary: '기아 0 : 0 삼성',
      userMessage: '어때?',
    });
    expect(p).toContain('<team>kia</team>');
    expect(p).toMatch(/당께|부러|쥑이/);
  });

  it('lotte → 부산 사투리 + <team>lotte</team>', () => {
    const p = buildReactionPrompt({
      teamId: 'lotte',
      scoreSummary: '롯데 0 : 0 NC',
      userMessage: '어때?',
    });
    expect(p).toContain('<team>lotte</team>');
    expect(p).toMatch(/아이가|카이|기라/);
  });
});

describe('PromptBuilder.buildReactionPrompt — personal_profile(priority=3) 주입 (6.3)', () => {
  it('personalContext 미지정 → personal_profile 블록 없음', () => {
    const p = buildReactionPrompt({
      teamId: 'hanwha',
      scoreSummary: '한화 0 : 0 롯데',
      userMessage: '어때?',
    });
    expect(p).not.toContain('<personal_profile');
  });

  it('중립 기본값(개인화 없음) → personal_profile 블록 없음', () => {
    const p = buildReactionPrompt({
      teamId: 'hanwha',
      scoreSummary: '한화 0 : 0 롯데',
      userMessage: '어때?',
      personalContext: DEFAULT_PERSONAL_CONTEXT,
    });
    expect(p).not.toContain('<personal_profile');
  });

  it('customPersona 있음 → personal_profile(priority=3) 포함 + knowledgeLevel 반영', () => {
    const ctx: PersonalContext = {
      profile: {
        teamId: 'hanwha',
        knowledgeLevel: 'expert',
        customPersona: '반말로 까칠하게',
        favoritePlayerIds: [],
      },
      session: { messageCount: 5, lastActiveIso: null },
      hints: { isReturningUser: true, hasCustomPersona: true },
    };
    const p = buildReactionPrompt({
      teamId: 'hanwha',
      scoreSummary: '한화 0 : 0 롯데',
      userMessage: '어때?',
      personalContext: ctx,
    });
    expect(p).toContain('<personal_profile priority="3">');
    expect(p).toContain('</personal_profile>');
    expect(p).toContain('<knowledge_level>expert</knowledge_level>');
    expect(p).toContain('<custom_persona>반말로 까칠하게</custom_persona>');
    // priority 순서: system_base(1) → personal_profile(3) → team_persona(4)
    expect(p.indexOf('<system_base')).toBeLessThan(p.indexOf('<personal_profile'));
    expect(p.indexOf('<personal_profile')).toBeLessThan(
      p.indexOf('<team_persona'),
    );
  });

  it('favorites 만 있어도(customPersona 없음) personal_profile 포함 + knowledgeLevel', () => {
    const ctx: PersonalContext = {
      profile: {
        teamId: 'kia',
        knowledgeLevel: 'core',
        customPersona: null,
        favoritePlayerIds: [101, 202],
      },
      session: { messageCount: 0, lastActiveIso: null },
      hints: { isReturningUser: false, hasCustomPersona: false },
    };
    const p = buildReactionPrompt({
      teamId: 'kia',
      scoreSummary: '기아 0 : 0 삼성',
      userMessage: '어때?',
      personalContext: ctx,
    });
    expect(p).toContain('<personal_profile priority="3">');
    expect(p).toContain('<knowledge_level>core</knowledge_level>');
    expect(p).not.toContain('<custom_persona>');
  });
});

describe('PromptBuilder.cannedReactionFor — 팀 톤 + 수치 미포함', () => {
  const teams: TeamId[] = ['hanwha', 'doosan', 'kia', 'lotte'];
  it.each(teams)('%s 캔드 리액션에 숫자가 없다', (team) => {
    expect(cannedReactionFor(team)).not.toMatch(/[0-9]/);
  });

  it('팀마다 캔드 리액션이 다르다', () => {
    const canned = teams.map((t) => cannedReactionFor(t));
    expect(new Set(canned).size).toBe(teams.length);
  });

  it('undefined → hanwha 캔드 폴백', () => {
    expect(cannedReactionFor(undefined)).toBe(cannedReactionFor('hanwha'));
  });
});
