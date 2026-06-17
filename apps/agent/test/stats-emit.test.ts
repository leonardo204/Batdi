/**
 * emitA2UI — stats intent 분기 단위테스트 (standings 카드 / 폴백)
 *
 *  - standingsData 주입 시 → standings_compact 순위 카드(12 컴포넌트) + data model rows 주입.
 *  - standingsData=null → 폴백 텍스트 카드(단일 Text, 순위 카드 아님) + AIMessage,
 *    L0 캐시 write 미실행(데이터 부재).
 *
 * graph.invoke 는 테스트 env(DATABASE_URL='')에서 standingsData=null → 폴백 경로만
 * 검증 가능하므로, 카드 경로는 state.standingsData 직접 주입 단위테스트로 검증한다.
 */
import { describe, it, expect, vi } from 'vitest';
import * as prismaMod from '../src/utils/prisma';
import { emitA2UI } from '../src/nodes/emit-a2ui';
import type { CoreGraphState } from '../src/state';
import type { StandingsData } from '../src/services/stats-graph';

const STANDINGS: StandingsData = {
  rows: Array.from({ length: 10 }, (_, n) => ({
    line: `${n + 1}  팀${n + 1}  ${40 - n}승${20 + n}패0무  ${(0.6 - n * 0.01).toFixed(3)}`,
  })),
};

function makeStatsState(over: Partial<CoreGraphState> = {}): CoreGraphState {
  return {
    messages: [],
    userMessage: '순위 알려줘',
    userMessageNormalized: '순위알려줘',
    userMessageDisplay: '순위 알려줘',
    userId: 'u1',
    teamId: 'lotte',
    inputGuardrailResult: { pass: true },
    outputGuardrailResult: undefined,
    intent: 'stats',
    intentConfidence: 'high',
    complexity: 'simple',
    cacheHit: 'miss',
    standingsData: STANDINGS,
    a2uiEnvelope: undefined,
    llmCallCount: undefined,
    traceId: undefined,
    ...over,
  } as unknown as CoreGraphState;
}

describe('emitA2UI — stats standingsData 있음 → 순위 카드', () => {
  it('standings_compact 카드(12 컴포넌트) + data model rows 주입', async () => {
    const update = await emitA2UI(makeStatsState());
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    // 정상 카드 경로 = 3 ops (createSurface/updateComponents/updateDataModel)
    expect(ops).toHaveLength(3);

    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    const comps = compOp?.updateComponents.components ?? [];
    expect(comps).toHaveLength(12);
    expect(comps[0]).toMatchObject({ id: 'root', component: 'Column' });

    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: Record<string, unknown> } }
      | undefined;
    expect(dataOp?.updateDataModel.value).toMatchObject({ rows: STANDINGS.rows });
    // 순위 카드엔 리액션 슬롯이 없다(reaction 키 미주입).
    expect(dataOp?.updateDataModel.value.reaction).toBeUndefined();
  });
});

describe('emitA2UI — stats standingsData 없음 → 폴백', () => {
  function makeNoDataState(): CoreGraphState {
    return makeStatsState({
      standingsData: null,
      cacheKey: 'stats:hash:lotte:default',
    } as Partial<CoreGraphState>);
  }

  it('standingsData=null → 순위 카드 대신 단일 Text 폴백 카드 + AIMessage', async () => {
    const update = await emitA2UI(makeNoDataState());
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    const comps = compOp?.updateComponents.components ?? [];
    // 폴백 카드: 단일 Text root (standings_compact 12노드가 아님).
    expect(comps).toHaveLength(1);
    expect(comps[0]).toMatchObject({ id: 'root', component: 'Text' });
    // AIMessage 가 동반(폴백 텍스트가 응답을 대신)
    const msgs = update.messages as Array<{ content: unknown }>;
    expect(String(msgs[0]?.content)).toContain('순위 정보가 없');
  });

  it('standingsData=null → L0 캐시 write 안 함(데이터 부재 캐시 금지)', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const spy = vi
      .spyOn(prismaMod, 'getPrisma')
      .mockReturnValue({ cacheUiEnvelope: { upsert } } as never);
    try {
      await emitA2UI(makeNoDataState());
      expect(upsert).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
