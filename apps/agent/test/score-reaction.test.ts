import { describe, it, expect, afterEach, vi } from 'vitest';
import { validateBatdiA2UI } from '@batdi/a2ui-schema';
import * as prismaMod from '../src/utils/prisma';
import {
  SCORE_COMPACT_COMPONENTS,
} from '../src/templates/score_compact';
import {
  compileBindings,
  getStubScoreData,
  REACTION_DATA_PATH,
} from '../src/databind/compile';
import { emitA2UI } from '../src/nodes/emit-a2ui';
import { teamPersona } from '../src/nodes/team-persona';
import type { CoreGraphState } from '../src/state';

describe('score_compact — reaction 슬롯 (P2-W6)', () => {
  it('root.children 끝에 reaction 노드 포함', () => {
    const root = SCORE_COMPACT_COMPONENTS.find((c) => c.id === 'root');
    expect((root?.children as string[]).at(-1)).toBe('reaction');
  });

  it('reaction 노드는 {{llm.reaction}} authoring 표기를 가진다', () => {
    const reaction = SCORE_COMPACT_COMPONENTS.find((c) => c.id === 'reaction');
    expect(reaction).toMatchObject({
      id: 'reaction',
      component: 'Text',
      text: '{{llm.reaction}}',
    });
  });

  it('compileBindings: {{llm.reaction}} → { path: "/reaction" }', () => {
    const compiled = compileBindings(SCORE_COMPACT_COMPONENTS);
    const reaction = compiled.find((c) => c.id === 'reaction');
    expect(reaction?.text).toEqual({ path: REACTION_DATA_PATH });
  });

  it('data model 에 /reaction 값이 있으면 valid (bind 와 동일 메커니즘)', () => {
    const compiled = compileBindings(SCORE_COMPACT_COMPONENTS);
    const data = {
      ...(getStubScoreData() as unknown as Record<string, unknown>),
      reaction: '오 좋은데유~',
    };
    const result = validateBatdiA2UI({
      components: compiled,
      data,
      validateBindings: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// P2-W5.5: score 카드 경로는 state.scoreData(실데이터)를 직접 주입해 검증한다
//   (DB 의존 제거 — 테스트 env 에선 fetchScoreData=null 이므로 단위 주입이 정확).
const SCORE_DATA = {
  home: { name: '한화', score: 5 },
  away: { name: '두산', score: 3 },
  inning: '6/16 경기 종료',
};

function makeScoreState(): CoreGraphState {
  return {
    messages: [],
    userMessage: '오늘 경기 어때?',
    userMessageNormalized: '오늘경기어때',
    userMessageDisplay: '오늘 경기 어때?',
    userId: 'u1',
    teamId: 'hanwha',
    inputGuardrailResult: { pass: true } as never,
    outputGuardrailResult: undefined,
    intent: 'score',
    intentConfidence: 'high',
    complexity: 'simple',
    cacheHit: 'miss',
    scoreData: SCORE_DATA,
    a2uiEnvelope: undefined,
    llmCallCount: undefined,
    traceId: undefined,
  } as unknown as CoreGraphState;
}

describe('emitA2UI — state.reaction 소비 (W6 분리)', () => {
  it('state.reaction 값을 data model /reaction 에 그대로 주입', async () => {
    const state = { ...makeScoreState(), reaction: '오 좋은데유~ 화이팅이여!' };
    const update = await emitA2UI(state);

    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: Record<string, unknown> } }
      | undefined;
    expect(dataOp).toBeDefined();
    expect(dataOp?.updateDataModel.value.reaction).toBe('오 좋은데유~ 화이팅이여!');
  });

  it('state.reaction 미설정(undefined) → /reaction 은 빈 문자열', async () => {
    const update = await emitA2UI(makeScoreState());
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: Record<string, unknown> } }
      | undefined;
    expect(dataOp?.updateDataModel.value.reaction).toBe('');
  });

  it('scoreData 실데이터 → score_compact 데이터 모델에 home/away/inning 주입', async () => {
    const update = await emitA2UI(makeScoreState());
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    // 정상 score 경로 = 3 ops (createSurface/updateComponents/updateDataModel)
    expect(ops).toHaveLength(3);
    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: Record<string, unknown> } }
      | undefined;
    expect(dataOp?.updateDataModel.value).toMatchObject({
      home: { name: '한화', score: 5 },
      away: { name: '두산', score: 3 },
      inning: '6/16 경기 종료',
    });
  });
});

describe('emitA2UI — score 실데이터 없음 → DataFallbackHandler (W5.5)', () => {
  function makeNoDataState(): CoreGraphState {
    return {
      ...makeScoreState(),
      scoreData: null,
      cacheKey: 'score:hash:hanwha:default',
    } as unknown as CoreGraphState;
  }

  it('scoreData=null → 점수 템플릿(score_compact) 대신 AIMessage 버블만(카드 미방출)', async () => {
    const update = await emitA2UI(makeNoDataState());
    // 텍스트-only 폴백: render_a2ui 카드 미방출(envelope 빈 배열).
    expect(update.a2uiEnvelope).toEqual([]);
    // AIMessage 버블이 응답을 대신한다(하나만).
    const msgs = update.messages as Array<{ content: unknown }>;
    expect(msgs).toBeDefined();
    expect(msgs).toHaveLength(1);
    expect(String(msgs[0]?.content)).toContain('경기 정보가 없');
    // 수치(점수) 미포함
    expect(String(msgs[0]?.content)).not.toMatch(/[0-9]/);
  });

  it('scoreData=null → L0 캐시 write 안 함(데이터 부재 캐시 금지)', async () => {
    // 폴백 경로는 writeL0Cache 를 호출하지 않는다(데이터 없는 상태를 캐시하면 stale fallback).
    // getPrisma 를 spy 해 upsert 미호출을 직접 증명한다.
    const upsert = vi.fn().mockResolvedValue({});
    const spy = vi
      .spyOn(prismaMod, 'getPrisma')
      .mockReturnValue({
        cacheUiEnvelope: { upsert },
      } as never);
    try {
      await emitA2UI(makeNoDataState());
      expect(upsert).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('teamPersona — 캔드 리액션 생성 (키 없음)', () => {
  const prevKey = process.env.GOOGLE_API_KEY;
  afterEach(() => {
    if (prevKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = prevKey;
  });

  it('GOOGLE_API_KEY 없으면 score 경로에서 캔드 리액션 생성 + 수치 미포함', async () => {
    delete process.env.GOOGLE_API_KEY;
    const update = await teamPersona(makeScoreState());

    const reaction = update.reaction as string;
    expect(typeof reaction).toBe('string');
    expect(reaction.length).toBeGreaterThan(0);
    // 수치(스코어/이닝 등 숫자) 미포함
    expect(reaction).not.toMatch(/[0-9]/);
  });

  it('score 외 intent(chat) → reaction 미생성(undefined)', async () => {
    delete process.env.GOOGLE_API_KEY;
    const state = { ...makeScoreState(), intent: 'chat' } as CoreGraphState;
    const update = await teamPersona(state);
    expect(update.reaction).toBeUndefined();
  });

  it('입력 가드레일 차단 시 reaction 미생성(undefined)', async () => {
    delete process.env.GOOGLE_API_KEY;
    const state = {
      ...makeScoreState(),
      inputGuardrailResult: { pass: false, violationType: 'ilbe_expression' },
    } as unknown as CoreGraphState;
    const update = await teamPersona(state);
    expect(update.reaction).toBeUndefined();
  });

  it('score 인데 scoreData=null(경기 없음) → reaction 미생성(undefined)', async () => {
    delete process.env.GOOGLE_API_KEY;
    const state = { ...makeScoreState(), scoreData: null } as CoreGraphState;
    const update = await teamPersona(state);
    expect(update.reaction).toBeUndefined();
  });
});
