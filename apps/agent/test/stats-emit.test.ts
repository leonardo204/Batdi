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
import type {
  StandingsData,
  StatsLeaderboard,
} from '../src/services/stats-graph';

const STANDINGS: StandingsData = {
  rows: Array.from({ length: 10 }, (_, n) => ({
    line: `${n + 1}  팀${n + 1}  ${40 - n}승${20 + n}패0무  ${(0.6 - n * 0.01).toFixed(3)}`,
  })),
};

const PLAYER_STATS: StatsLeaderboard = {
  kind: 'batting',
  rows: Array.from({ length: 6 }, (_, n) => ({
    line: `${n + 1}  선수${n + 1}  ${(0.36 - n * 0.01).toFixed(3)}  ${10 - n}홈런  ${49 - n}타점`,
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

  it('standingsData=null → 순위 카드 대신 AIMessage 버블만(카드 미방출)', async () => {
    const update = await emitA2UI(makeNoDataState());
    // 텍스트-only 폴백: render_a2ui 카드 미방출(envelope 빈 배열).
    expect(update.a2uiEnvelope).toEqual([]);
    // AIMessage 버블이 응답을 대신한다(하나만).
    const msgs = update.messages as Array<{ content: unknown }>;
    expect(msgs).toHaveLength(1);
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

// ─── P3-W7 7.3b: stats statType=player 선수 리더보드 분기 ───

describe('emitA2UI — stats statType=player + playerStats 있음 → 리더보드 카드', () => {
  it('player_stat_compact 카드(8 컴포넌트) + data model rows 주입', async () => {
    const update = await emitA2UI(
      makeStatsState({
        statType: 'player',
        playerStats: PLAYER_STATS,
        standingsData: undefined,
        userMessage: '타율 어때',
        userMessageNormalized: '타율어때',
        // core 는 레벨 footnote 가 붙지 않아 기본 카드(8노드) 구조를 그대로 검증.
        personalContext: {
          profile: {
            teamId: 'lotte',
            knowledgeLevel: 'core',
            customPersona: null,
            favoritePlayerIds: [],
            longTermSummary: null,
          },
          session: { messageCount: 0, lastActiveIso: null },
          hints: { isReturningUser: false, hasCustomPersona: false },
        },
      } as unknown as Partial<CoreGraphState>),
    );
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    expect(ops).toHaveLength(3);

    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    const comps = compOp?.updateComponents.components ?? [];
    // player_stat_compact = 8 컴포넌트 (root + title + 6줄), standings 12 가 아님.
    expect(comps).toHaveLength(8);
    expect(comps[0]).toMatchObject({ id: 'root', component: 'Column' });

    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: Record<string, unknown> } }
      | undefined;
    expect(dataOp?.updateDataModel.value).toMatchObject({
      rows: PLAYER_STATS.rows,
    });
    // 리더보드 카드엔 리액션 슬롯이 없다.
    expect(dataOp?.updateDataModel.value.reaction).toBeUndefined();
  });
});

describe('emitA2UI — stats statType=player + playerStats=null → 폴백', () => {
  it('playerStats=null → 리더보드 카드 대신 AIMessage 버블만(카드 미방출)', async () => {
    const update = await emitA2UI(
      makeStatsState({
        statType: 'player',
        playerStats: null,
        standingsData: undefined,
        cacheKey: 'stats:hash:lotte:default',
      } as Partial<CoreGraphState>),
    );
    // 텍스트-only 폴백: render_a2ui 카드 미방출(envelope 빈 배열).
    expect(update.a2uiEnvelope).toEqual([]);
    const msgs = update.messages as Array<{ content: unknown }>;
    expect(msgs).toHaveLength(1);
    expect(String(msgs[0]?.content)).toContain('선수 기록이 없');
  });

  it('playerStats=null → L0 캐시 write 안 함(데이터 부재 캐시 금지)', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const spy = vi
      .spyOn(prismaMod, 'getPrisma')
      .mockReturnValue({ cacheUiEnvelope: { upsert } } as never);
    try {
      await emitA2UI(
        makeStatsState({
          statType: 'player',
          playerStats: null,
          standingsData: undefined,
          cacheKey: 'stats:hash:lotte:default',
        } as Partial<CoreGraphState>),
      );
      expect(upsert).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

// ─── P3-W9 9.5: 지식 레벨 적응 footnote (standings) ───

/** knowledgeLevel 을 가진 PersonalContext 를 주입한 stats(standings) state */
function makeLeveledState(
  knowledgeLevel: 'beginner' | 'core' | 'expert',
): CoreGraphState {
  return makeStatsState({
    statType: 'standings',
    cacheKey: 'stats:hash:lotte:default',
    personalContext: {
      profile: {
        teamId: 'lotte',
        knowledgeLevel,
        customPersona: null,
        favoritePlayerIds: [],
        longTermSummary: null,
      },
      session: { messageCount: 0, lastActiveIso: null },
      hints: { isReturningUser: false, hasCustomPersona: false },
    },
  } as unknown as Partial<CoreGraphState>);
}

describe('emitA2UI — stats standings 지식 레벨 적응(P3-W9 9.5)', () => {
  it('beginner → 방출 components 에 level_note 포함 + L0 write 미호출(캐시 포이즌 방지)', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const spy = vi
      .spyOn(prismaMod, 'getPrisma')
      .mockReturnValue({ cacheUiEnvelope: { upsert } } as never);
    try {
      const update = await emitA2UI(makeLeveledState('beginner'));
      const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
      const compOp = ops.find((o) => 'updateComponents' in o) as
        | { updateComponents: { components: Array<Record<string, unknown>> } }
        | undefined;
      const comps = compOp?.updateComponents.components ?? [];
      // standings 12 + level_note 1 = 13 컴포넌트.
      expect(comps).toHaveLength(13);
      const note = comps.find((c) => c.id === 'level_note');
      expect(note).toMatchObject({ component: 'Text', variant: 'caption' });
      // 레벨 적응 카드는 비-레벨 키로 캐시 금지 → upsert 미호출.
      expect(upsert).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('core → level_note 없음 + L0 write 정상 호출(기존 회귀)', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const spy = vi
      .spyOn(prismaMod, 'getPrisma')
      .mockReturnValue({ cacheUiEnvelope: { upsert } } as never);
    try {
      const update = await emitA2UI(makeLeveledState('core'));
      const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
      const compOp = ops.find((o) => 'updateComponents' in o) as
        | { updateComponents: { components: Array<Record<string, unknown>> } }
        | undefined;
      const comps = compOp?.updateComponents.components ?? [];
      // core 는 기본 카드 그대로 → 12 컴포넌트, level_note 없음.
      expect(comps).toHaveLength(12);
      expect(comps.find((c) => c.id === 'level_note')).toBeUndefined();
      // core(비개인화 favorites 없음)는 기존대로 L0 write 호출.
      expect(upsert).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
