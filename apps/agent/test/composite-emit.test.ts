/**
 * emitA2UI — P3-W9 9.1 composite(L3 UIComposer) 분기 단위테스트
 *
 *  - composeL3 가 valid components 반환(UIValidator 게이트 통과) → L3 동적 카드 렌더.
 *  - composeL3 가 게이트 초과(maxNodes 31) components 반환 → 게이트 실패 → 대표 intent L1 폴백.
 *  - composeL3 가 null(키 없음/파싱 실패) → 대표 intent L1 폴백(score 템플릿 등).
 *  - composite 는 L0 캐시 write 하지 않는다(LLM 비결정).
 *
 * composeL3 는 모듈 모킹으로 결정론적 입력을 주입하고, 게이트(validateBatdiA2UI)는
 * 실제 로직을 그대로 통과시켜 "게이트가 maxNodes/depth 초과 출력을 폴백시키는지"를 증명한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as l3Mod from '../src/services/l3-composer';
import * as prismaMod from '../src/utils/prisma';
import { emitA2UI } from '../src/nodes/emit-a2ui';
import type { CoreGraphState } from '../src/state';
import type { ScoreData } from '../src/services/score-graph';
import type { StandingsData } from '../src/services/stats-graph';

const SCORE: ScoreData = {
  home: { name: '롯데', score: 5 },
  away: { name: '두산', score: 3 },
  inning: '6/16 경기 종료',
  status: 'FINISHED',
};

const STANDINGS: StandingsData = {
  // standings_compact 는 rows.0..rows.9 (10줄) 바인딩이라 10행 필요(미달 시 unresolved_binding).
  rows: Array.from({ length: 10 }, (_, n) => ({
    line: `${n + 1}  팀${n + 1}  ${40 - n}승${20 + n}패0무  0.${600 - n}`,
  })),
};

function makeCompositeState(
  over: Partial<CoreGraphState> = {},
): CoreGraphState {
  return {
    messages: [],
    userMessage: '스코어랑 순위 같이 알려줘',
    userMessageNormalized: '스코어랑순위같이알려줘',
    userMessageDisplay: '스코어랑 순위 같이 알려줘',
    userId: 'u1',
    teamId: 'lotte',
    inputGuardrailResult: { pass: true },
    intent: 'score', // 대표 intent
    matchedIntents: ['score', 'stats'],
    intentConfidence: 'high',
    complexity: 'composite',
    cacheHit: 'miss',
    scoreData: SCORE,
    standingsData: STANDINGS,
    a2uiEnvelope: undefined,
    ...over,
  } as unknown as CoreGraphState;
}

describe('emitA2UI — composite L3 게이트 통과 → 동적 카드 렌더', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('composeL3 valid components → 3 ops(L3 카드), L1 폴백 아님', async () => {
    // 게이트(maxDepth4/maxNodes30/카탈로그/바인딩)를 통과하는 작은 spec.
    vi.spyOn(l3Mod, 'composeL3').mockResolvedValue({
      components: [
        { id: 'root', component: 'Column', children: ['t1', 't2'] },
        { id: 't1', component: 'Text', text: { path: '/score/home/name' } },
        { id: 't2', component: 'Text', text: { path: '/standings/0/line' } },
      ],
      data: {
        score: { home: { name: '롯데' } },
        standings: [{ line: '1  LG  41승24패0무  0.631' }],
      },
    });

    const update = await emitA2UI(makeCompositeState());
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    // 게이트 통과 → 3 ops(createSurface/updateComponents/updateDataModel).
    expect(ops).toHaveLength(3);

    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    const comps = compOp?.updateComponents.components ?? [];
    // L3 동적 카드: root=Column + 자식 2개 = 3 노드(L1 score 템플릿/단일 Text 폴백 아님).
    expect(comps).toHaveLength(3);
    expect(comps[0]).toMatchObject({ id: 'root', component: 'Column' });
  });
});

describe('emitA2UI — composite L3 게이트 실패(maxNodes 초과) → 대표 intent L1 폴백', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('LLM 출력 노드 31개 → 게이트가 폴백시킴 → score L1 템플릿(scoreData)', async () => {
    // root(Column) + Text 자식 31개 = 32 노드 → maxNodes(30) 초과 → 게이트 실패.
    const childIds = Array.from({ length: 31 }, (_, n) => `t${n}`);
    const overNodes: Array<Record<string, unknown>> = [
      { id: 'root', component: 'Column', children: childIds },
      ...childIds.map((id) => ({ id, component: 'Text', text: 'x' })),
    ];
    vi.spyOn(l3Mod, 'composeL3').mockResolvedValue({
      components: overNodes,
      data: {},
    });

    const update = await emitA2UI(makeCompositeState());
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;

    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    const comps = compOp?.updateComponents.components ?? [];
    // 폴백 = 대표 intent(score) L1 템플릿. 32 노드(초과 LLM 출력)가 아니어야 한다.
    expect(comps.length).toBeLessThan(32);
    // score_emphasized(FINISHED) 템플릿 root 는 Column(단일 Text 폴백이 아님 — scoreData 보유).
    expect(comps[0]).toMatchObject({ id: 'root' });
    // 게이트 통과(폴백 카드는 valid) → updateDataModel 포함(3 ops).
    expect(ops.some((o) => 'updateDataModel' in o)).toBe(true);
  });
});

describe('emitA2UI — composite composeL3 null(키 없음 등) → 대표 intent L1 폴백', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('composeL3=null + 대표 score + scoreData → score L1 카드 폴백', async () => {
    vi.spyOn(l3Mod, 'composeL3').mockResolvedValue(null);
    const update = await emitA2UI(makeCompositeState());
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    const comps = compOp?.updateComponents.components ?? [];
    expect(comps[0]).toMatchObject({ id: 'root' });
    // score 데이터 주입(home/away) → updateDataModel 존재.
    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: Record<string, unknown> } }
      | undefined;
    expect(dataOp?.updateDataModel.value).toMatchObject({ home: SCORE.home });
  });

  it('composeL3=null + 대표 stats(데이터만 standings) → 순위 L1 카드 폴백', async () => {
    vi.spyOn(l3Mod, 'composeL3').mockResolvedValue(null);
    const update = await emitA2UI(
      makeCompositeState({
        intent: 'stats',
        matchedIntents: ['stats', 'score'],
        statType: 'standings',
        scoreData: undefined,
      } as Partial<CoreGraphState>),
    );
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: Record<string, unknown> } }
      | undefined;
    expect(dataOp?.updateDataModel.value).toMatchObject({ rows: STANDINGS.rows });
  });

  it('composite → L0 캐시 write 안 함(LLM 비결정)', async () => {
    vi.spyOn(l3Mod, 'composeL3').mockResolvedValue(null);
    const upsert = vi.fn().mockResolvedValue({});
    vi.spyOn(prismaMod, 'getPrisma').mockReturnValue({
      cacheUiEnvelope: { upsert },
    } as never);
    await emitA2UI(
      makeCompositeState({ cacheKey: 'score:hash:lotte:default' } as Partial<CoreGraphState>),
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});
