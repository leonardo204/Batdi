/**
 * CacheLookup 노드 (P2-W4 4.5) — L0 Envelope 캐시 조회
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §4.2 (L0 Envelope 캐시),
 *       Ref-docs/specs/interface/batdi-db-schema.md D그룹 cache_ui_envelopes
 *
 * 동작:
 *  1) 캐시 키 생성(buildCacheKey): `${intent}:${paramsHash}:${teamId ?? 'none'}:${scope}`
 *     - paramsHash: userMessageNormalized 의 sha256 hex 앞 16자(입력 기반 결정론 — Date/random X)
 *     - personaScope: score(팀 톤 reaction 포함)면 'team_only', 그 외 'default'
 *       (P2 개인화 미구현 — custom_persona/profile 주입 없으니 항상 캐시 가능.
 *        구조만 scope 분기. 향후 개인화 응답은 write 금지 → Cache Poisoning 방지)
 *  2) prisma.cacheUiEnvelope.findUnique({ where: { cacheKey } }) 후 expiresAt > now 검사
 *     - HIT  : a2uiEnvelope = JSON.parse(envelopeJsonl), cacheHit='L0', hit_count 증분(fire-and-forget)
 *     - MISS / 만료 / DB 에러: cacheHit='miss' (best-effort — DB 실패가 그래프를 막지 않음)
 *  3) 생성한 cacheKey 를 state 에 보관 → MISS 경로 종단(EmitA2UI)에서 write(upsert) 에 사용.
 */
import { createHash } from 'node:crypto';
import type { A2UIEnvelope } from '@batdi/types';
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import { getPrisma } from '../utils/prisma';

/** L0 캐시 persona_scope (개인화 격리 — architecture §4.2) */
export type PersonaScope = 'default' | 'team_only';

/**
 * intent 기반 personaScope 결정.
 * score 는 팀 톤 reaction(team_only 페르소나 산물)이 envelope 에 포함되므로 'team_only',
 * 그 외(chat 등 비개인화 기본)는 'default'.
 * ⚠️ 향후 custom_persona/personal_profile 주입 시엔 개인화 응답으로 간주 → write 자체 금지.
 */
export function personaScopeFor(intent: CoreGraphState['intent']): PersonaScope {
  return intent === 'score' ? 'team_only' : 'default';
}

/** userMessageNormalized → sha256 hex 앞 16자(결정론적 params hash) */
export function paramsHashOf(normalized: string): string {
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
}

/**
 * L0 캐시 키 생성: `${intent}:${paramsHash}:${teamId ?? 'none'}:${personaScope}`
 * 동일 intent + 동일 질의(정규화) + 동일 팀 + 동일 scope 면 같은 키 → LLM 0회 재사용.
 */
export function buildCacheKey(state: CoreGraphState): {
  cacheKey: string;
  personaScope: PersonaScope;
  paramsHash: string;
} {
  const personaScope = personaScopeFor(state.intent);
  const paramsHash = paramsHashOf(state.userMessageNormalized ?? '');
  const team = state.teamId ?? 'none';
  const cacheKey = `${state.intent}:${paramsHash}:${team}:${personaScope}`;
  return { cacheKey, personaScope, paramsHash };
}

export async function cacheLookup(
  state: CoreGraphState,
): Promise<CoreGraphUpdate> {
  const { cacheKey } = buildCacheKey(state);

  const prisma = getPrisma();
  if (!prisma) {
    // DB 비활성(DATABASE_URL 없음 등) → 캐시 skip, 키만 보관(write 도 prisma 없으면 skip).
    return { cacheHit: 'miss', cacheKey };
  }

  try {
    const row = await prisma.cacheUiEnvelope.findUnique({
      where: { cacheKey },
    });

    // MISS(레코드 없음) 또는 만료 → miss. (now 는 노드 런타임이라 new Date() 허용)
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      return { cacheHit: 'miss', cacheKey };
    }

    // HIT: 완성 envelope 재사용(LLM 0). hit_count 증분은 best-effort(응답을 막지 않음).
    const envelope = JSON.parse(row.envelopeJsonl) as A2UIEnvelope;
    void prisma.cacheUiEnvelope
      .update({
        where: { cacheKey },
        data: { hitCount: { increment: 1 } },
      })
      .catch(() => {
        /* hit_count 증분 실패는 무시(캐시 정합성에 비치명적) */
      });

    return { cacheHit: 'L0', a2uiEnvelope: envelope, cacheKey };
  } catch {
    // DB 에러(연결 실패·파싱 실패 등) → graceful MISS. 그래프는 정상 흐름으로 진행.
    return { cacheHit: 'miss', cacheKey };
  }
}
