/**
 * L0 캐시 포이즌 가드 E2E (P2-W6 6.3, CLAUDE.md §4.2 불변식)
 *
 * "L0 캐시는 비개인화 응답만. custom_persona·personal_profile·favorites 주입 응답은
 *  write 금지(Cache Poisoning 방지)."
 *
 * getPrisma 를 모킹해 cacheUiEnvelope.upsert 를 spy 하고, personalContext 노드가
 * 조립하는 PersonalContext 를 buildContext 모킹으로 제어한다(isPersonalized 는 실제 사용):
 *  - 개인화(customPersona 있음) → score MISS 종단에서 upsert 가 호출되지 않아야 한다(SKIP).
 *  - 비개인화(중립 기본값) → upsert 가 호출되어야 한다(정상 write).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PersonalContext } from '@batdi/types';
import {
  DEFAULT_PERSONAL_CONTEXT,
  isPersonalized,
} from '../src/personal/personal-agent';

// cacheUiEnvelope.upsert spy + findUnique 는 항상 MISS(null) → MISS 경로 진입.
const upsert = vi.fn().mockResolvedValue({});
const findUnique = vi.fn().mockResolvedValue(null);

vi.mock('../src/utils/prisma', () => ({
  getPrisma: () => ({
    cacheUiEnvelope: { findUnique, upsert, update: vi.fn().mockResolvedValue({}) },
  }),
  __resetPrismaForTest: () => {},
}));

// personalContext 노드가 조립하는 컨텍스트를 제어. isPersonalized 는 실제 구현 유지.
const { mockBuildContext } = vi.hoisted(() => ({ mockBuildContext: vi.fn() }));
vi.mock('../src/personal/personal-agent', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/personal/personal-agent')>();
  return { ...actual, buildContext: mockBuildContext };
});

import { graph } from '../src/graph';

const PERSONALIZED: PersonalContext = {
  profile: {
    teamId: 'hanwha',
    knowledgeLevel: 'expert',
    customPersona: '반말로 까칠하게',
    favoritePlayerIds: [101],
  },
  session: { messageCount: 9, lastActiveIso: null },
  hints: { isReturningUser: true, hasCustomPersona: true },
};

describe('L0 캐시 포이즌 가드', () => {
  beforeEach(() => {
    upsert.mockClear();
    findUnique.mockClear();
    mockBuildContext.mockReset();
  });

  it('개인화 컨텍스트(isPersonalized=true) → L0 write SKIP(upsert 미호출)', async () => {
    expect(isPersonalized(PERSONALIZED)).toBe(true);
    mockBuildContext.mockResolvedValue(PERSONALIZED);

    const out = await graph.invoke({
      messages: [{ role: 'user', content: '지금 몇 대 몇이야' }],
      userMessage: '지금 몇 대 몇이야',
      userId: '00000000-0000-0000-0000-000000000001',
    });

    // MISS 경로 정상 진행(envelope 생성·방출) 했지만 캐시 write 는 SKIP.
    expect(out.cacheHit).toBe('miss');
    expect(out.a2uiEnvelope).toBeDefined();
    expect(out.personalContext).toEqual(PERSONALIZED);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('비개인화(중립 기본값) → L0 write 정상(upsert 호출)', async () => {
    mockBuildContext.mockResolvedValue(DEFAULT_PERSONAL_CONTEXT);

    const out = await graph.invoke({
      messages: [{ role: 'user', content: '지금 몇 대 몇이야' }],
      userMessage: '지금 몇 대 몇이야',
      userId: '00000000-0000-0000-0000-000000000002',
    });

    expect(out.cacheHit).toBe('miss');
    expect(isPersonalized(out.personalContext)).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
