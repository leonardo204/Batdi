/**
 * P2-W4 (4.5) L0 캐시 HIT E2E (헤드리스, Prisma 모킹).
 *
 * getPrisma 를 모킹해 findUnique 가 미만료 envelope 를 반환하도록 강제하면,
 * graph 가 cacheLookup HIT → emitA2UI 직행(uiComposer/dataBinder/teamPersona/
 * outputGuardrail 우회)으로 캐시 envelope 를 그대로 재사용하는지 검증한다.
 * (LLM 0 — outputGuardrailResult 미설정으로 우회 확인)
 */
import { describe, it, expect, vi } from 'vitest';

// 캐시 HIT 시 재사용될 완성 envelope (정상 score 3-op 형태).
const cachedOps = [
  { createSurface: { surfaceId: 'batdi-main', catalogId: 'batdi-basic' } },
  {
    updateComponents: {
      surfaceId: 'batdi-main',
      components: [{ id: 'root', component: 'Text', text: '캐시된 카드' }],
    },
  },
  {
    updateDataModel: {
      surfaceId: 'batdi-main',
      value: { reaction: '캐시 리액션이여~' },
    },
  },
];

const findUnique = vi.fn().mockResolvedValue({
  cacheKey: 'k',
  envelopeJsonl: JSON.stringify(cachedOps),
  expiresAt: new Date(Date.now() + 60_000),
});

vi.mock('../src/utils/prisma', () => ({
  getPrisma: () => ({
    cacheUiEnvelope: { findUnique, update: vi.fn().mockResolvedValue({}) },
  }),
  __resetPrismaForTest: () => {},
}));

import { graph } from '../src/graph';

describe('L0 캐시 HIT E2E', () => {
  it('HIT 시 emitA2UI 직행 → 캐시 envelope 재사용(중간 노드 우회)', async () => {
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '지금 몇 대 몇이야' }],
      userMessage: '지금 몇 대 몇이야',
    });
    expect(out.cacheHit).toBe('L0');
    // 캐시된 envelope 가 그대로 state 에 실린다.
    expect(out.a2uiEnvelope).toEqual(cachedOps);
    expect(JSON.stringify(out.a2uiEnvelope)).toContain('캐시된 카드');
    // 중간 노드(teamPersona→outputGuardrail) 우회 → reaction/outputGuardrailResult 미설정.
    expect(out.reaction).toBeUndefined();
    expect(out.outputGuardrailResult).toBeUndefined();
    expect(findUnique).toHaveBeenCalled();
  });
});
