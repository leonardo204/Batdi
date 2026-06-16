/**
 * CacheLookup 노드 (P2-W4 4.5) 단위 테스트 — L0 Envelope 캐시 조회.
 *
 * Prisma 는 getPrisma 모킹으로 격리(실제 DB 미접속). 검증:
 *  - 캐시 키 생성 규칙(intent/paramsHash/team/scope)
 *  - HIT(미만료) → cacheHit='L0' + a2uiEnvelope 주입
 *  - MISS(레코드 없음) → 'miss'
 *  - 만료(expiresAt <= now) → 'miss'
 *  - DB 에러 → 'miss' (graceful, best-effort)
 *  - DB 비활성(getPrisma undefined) → 'miss' + cacheKey 보관
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// getPrisma 를 모킹 — cache-lookup 이 이 export 를 통해서만 Prisma 에 접근한다.
const findUnique = vi.fn();
const update = vi.fn().mockResolvedValue({});
let prismaInstance: unknown = {
  cacheUiEnvelope: { findUnique, update },
};

vi.mock('../src/utils/prisma', () => ({
  getPrisma: () => prismaInstance,
  __resetPrismaForTest: () => {},
}));

import {
  cacheLookup,
  buildCacheKey,
  paramsHashOf,
  personaScopeFor,
} from '../src/nodes/cache-lookup';
import type { CoreGraphState } from '../src/state';

/** 최소 score state 빌더 */
function scoreState(over: Partial<CoreGraphState> = {}): CoreGraphState {
  return {
    messages: [],
    userMessage: '지금 몇 대 몇이야',
    userMessageNormalized: '지금몇대몇이야',
    userMessageDisplay: '지금 몇 대 몇이야',
    userId: 'u1',
    teamId: 'lotte',
    intent: 'score',
    intentConfidence: 'high',
    complexity: 'simple',
    cacheHit: 'miss',
    ...over,
  } as unknown as CoreGraphState;
}

const sampleEnvelope = [
  { createSurface: { surfaceId: 'batdi-main' } },
  { updateComponents: { components: [{ id: 'root', component: 'Text' }] } },
  { updateDataModel: { value: { score: '5:3', reaction: '좋아유~' } } },
];

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset().mockResolvedValue({});
  prismaInstance = { cacheUiEnvelope: { findUnique, update } };
});

describe('캐시 키 생성 규칙', () => {
  it('paramsHashOf — 같은 입력은 같은 16자 hex, 다른 입력은 다른 해시', () => {
    const a = paramsHashOf('지금몇대몇이야');
    const b = paramsHashOf('지금몇대몇이야');
    const c = paramsHashOf('롯데이겼어');
    expect(a).toHaveLength(16);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).toBe(b); // 결정론
    expect(a).not.toBe(c);
  });

  it('personaScopeFor — score=team_only, 그 외=default', () => {
    expect(personaScopeFor('score')).toBe('team_only');
    expect(personaScopeFor('chat')).toBe('default');
    expect(personaScopeFor('news')).toBe('default');
  });

  it('buildCacheKey — `${intent}:${paramsHash}:${team}:${scope}` 형식', () => {
    const { cacheKey, personaScope, paramsHash } = buildCacheKey(scoreState());
    expect(cacheKey).toBe(`score:${paramsHash}:lotte:team_only`);
    expect(personaScope).toBe('team_only');
  });

  it('buildCacheKey — teamId 없으면 none', () => {
    const { cacheKey } = buildCacheKey(
      scoreState({ teamId: undefined, intent: 'chat' }),
    );
    expect(cacheKey).toContain(':none:default');
  });
});

describe('cacheLookup — 조회 결과별 동작', () => {
  it('HIT(미만료) → cacheHit=L0 + a2uiEnvelope 주입 + hit_count 증분 호출', async () => {
    findUnique.mockResolvedValue({
      cacheKey: 'k',
      envelopeJsonl: JSON.stringify(sampleEnvelope),
      expiresAt: new Date(Date.now() + 60_000), // 미래 = 미만료
    });
    const out = await cacheLookup(scoreState());
    expect(out.cacheHit).toBe('L0');
    expect(out.a2uiEnvelope).toEqual(sampleEnvelope);
    expect(out.cacheKey).toMatch(/^score:/);
    // hit_count 증분(fire-and-forget) 호출 검증
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { hitCount: { increment: 1 } } }),
    );
  });

  it('MISS(레코드 없음) → cacheHit=miss + cacheKey 보관', async () => {
    findUnique.mockResolvedValue(null);
    const out = await cacheLookup(scoreState());
    expect(out.cacheHit).toBe('miss');
    expect(out.a2uiEnvelope).toBeUndefined();
    expect(out.cacheKey).toMatch(/^score:/);
  });

  it('만료(expiresAt <= now) → cacheHit=miss', async () => {
    findUnique.mockResolvedValue({
      cacheKey: 'k',
      envelopeJsonl: JSON.stringify(sampleEnvelope),
      expiresAt: new Date(Date.now() - 1000), // 과거 = 만료
    });
    const out = await cacheLookup(scoreState());
    expect(out.cacheHit).toBe('miss');
    expect(out.a2uiEnvelope).toBeUndefined();
  });

  it('DB 에러 → graceful miss (그래프를 막지 않음)', async () => {
    findUnique.mockRejectedValue(new Error('connection refused'));
    const out = await cacheLookup(scoreState());
    expect(out.cacheHit).toBe('miss');
    expect(out.cacheKey).toMatch(/^score:/);
  });

  it('DB 비활성(getPrisma undefined) → miss + cacheKey 보관', async () => {
    prismaInstance = undefined;
    const out = await cacheLookup(scoreState());
    expect(out.cacheHit).toBe('miss');
    expect(out.cacheKey).toMatch(/^score:/);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
