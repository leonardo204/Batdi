/**
 * PersonalAgent 서비스 테스트 (P2-W6 6.3)
 *
 * vitest.config.ts 가 DATABASE_URL='' 을 강제 → getPrisma()는 항상 undefined.
 * 따라서 buildContext 는 "DB 없음 → 중립 기본값" 경로로 검증한다(best-effort).
 * deriveKnowledgeLevel / isPersonalized 는 순수 함수라 직접 검증한다.
 */
import { describe, it, expect } from 'vitest';
import type { PersonalContext } from '@batdi/types';
import {
  buildContext,
  deriveKnowledgeLevel,
  isPersonalized,
  DEFAULT_PERSONAL_CONTEXT,
} from '../src/personal/personal-agent';

describe('PersonalAgent.buildContext — best-effort(DB 없음)', () => {
  it('DB 비활성(테스트 기본) → 중립 기본값 반환', async () => {
    const ctx = await buildContext('00000000-0000-0000-0000-000000000001');
    expect(ctx).toEqual(DEFAULT_PERSONAL_CONTEXT);
  });

  it('userId 없음 → 중립 기본값(DB 조회 안 함)', async () => {
    expect(await buildContext(undefined)).toEqual(DEFAULT_PERSONAL_CONTEXT);
    expect(await buildContext('')).toEqual(DEFAULT_PERSONAL_CONTEXT);
  });

  it('중립 기본값은 개인화 없음(profile/session/hints)', async () => {
    const ctx = await buildContext(undefined);
    expect(ctx.profile.teamId).toBeNull();
    expect(ctx.profile.knowledgeLevel).toBe('beginner');
    expect(ctx.profile.customPersona).toBeNull();
    expect(ctx.profile.favoritePlayerIds).toEqual([]);
    expect(ctx.session.messageCount).toBe(0);
    expect(ctx.session.lastActiveIso).toBeNull();
    expect(ctx.hints.isReturningUser).toBe(false);
    expect(ctx.hints.hasCustomPersona).toBe(false);
  });
});

describe('PersonalAgent.deriveKnowledgeLevel — User.level 파생', () => {
  it('1-2 → beginner', () => {
    expect(deriveKnowledgeLevel(1)).toBe('beginner');
    expect(deriveKnowledgeLevel(2)).toBe('beginner');
  });
  it('3-5 → core', () => {
    expect(deriveKnowledgeLevel(3)).toBe('core');
    expect(deriveKnowledgeLevel(5)).toBe('core');
  });
  it('6+ → expert', () => {
    expect(deriveKnowledgeLevel(6)).toBe('expert');
    expect(deriveKnowledgeLevel(99)).toBe('expert');
  });
  it('null/undefined → beginner(폴백)', () => {
    expect(deriveKnowledgeLevel(null)).toBe('beginner');
    expect(deriveKnowledgeLevel(undefined)).toBe('beginner');
  });
});

describe('PersonalAgent.isPersonalized — L0 캐시 가드 판정', () => {
  const base: PersonalContext = DEFAULT_PERSONAL_CONTEXT;

  it('중립 기본값 → false', () => {
    expect(isPersonalized(base)).toBe(false);
  });
  it('undefined → false', () => {
    expect(isPersonalized(undefined)).toBe(false);
  });
  it('customPersona 있음 → true', () => {
    const ctx: PersonalContext = {
      ...base,
      profile: { ...base.profile, customPersona: '반말로 친근하게' },
    };
    expect(isPersonalized(ctx)).toBe(true);
  });
  it('빈 customPersona(공백) → false', () => {
    const ctx: PersonalContext = {
      ...base,
      profile: { ...base.profile, customPersona: '   ' },
    };
    expect(isPersonalized(ctx)).toBe(false);
  });
  it('favoritePlayerIds 있음 → true', () => {
    const ctx: PersonalContext = {
      ...base,
      profile: { ...base.profile, favoritePlayerIds: [101] },
    };
    expect(isPersonalized(ctx)).toBe(true);
  });
});
