import { describe, it, expect, afterEach } from 'vitest';
import { validateBatdiA2UI } from '@batdi/a2ui-schema';
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
});
