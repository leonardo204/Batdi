import { describe, it, expect, afterEach } from 'vitest';
import { graph } from '../src/graph';

describe('Core graph compile + end-to-end (headless)', () => {
  // GOOGLE_API_KEY 를 만지는 테스트가 전역 env를 오염시키지 않도록 저장·복원
  const savedApiKey = process.env.GOOGLE_API_KEY;
  afterEach(() => {
    if (savedApiKey === undefined) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = savedApiKey;
    }
  });

  it('graph가 컴파일된 Runnable로 export 된다', () => {
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe('function');
  });

  it('score 질의(DB 없음) → DataFallbackHandler 단일 Text 폴백 카드 + AIMessage', async () => {
    // P2-W5.5: 테스트 env 는 DATABASE_URL='' → fetchScoreData=null(best-effort).
    //   score intent 인데 실데이터 없음 → 점수 템플릿 대신 팀 톤 폴백 텍스트 카드.
    //   (실데이터 주입 경로 검증은 score-reaction.test.ts 의 emitA2UI 단위테스트가 담당.)
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '지금 몇 대 몇이야' }],
      userMessage: '지금 몇 대 몇이야',
    });
    expect(out.intent).toBe('score');
    expect(out.cacheHit).toBe('miss');
    expect(out.complexity).toBe('simple');
    expect(out.scoreData).toBeNull();
    // 폴백 카드는 단일 Text root (score_compact 다중 노드가 아님), 데이터 모델 비어있음.
    expect(out.a2uiEnvelope).toBeDefined();
    const ops = out.a2uiEnvelope as Array<Record<string, unknown>>;
    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    expect(compOp?.updateComponents.components).toHaveLength(1);
    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: Record<string, unknown> } }
      | undefined;
    expect(dataOp?.updateDataModel.value.inning).toBeUndefined();
    expect(JSON.stringify(out.a2uiEnvelope)).toContain('createSurface');
    // 폴백 AIMessage 가 응답을 대신한다.
    const last = out.messages[out.messages.length - 1];
    expect(String(last.content)).toContain('경기 정보가 없');
  });

  it('가드레일 차단(일베) → intentRouter 우회, fallbackResponse AIMessage + Text 카드', async () => {
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '일베 짤 보여줘' }],
      userMessage: '일베 짤 보여줘',
    });
    expect(out.inputGuardrailResult?.pass).toBe(false);
    expect(out.inputGuardrailResult?.violationType).toBe('ilbe_expression');
    // intentRouter 가 우회되어 intent 는 set 되지 않거나 기본값 유지
    const last = out.messages[out.messages.length - 1];
    expect(String(last.content)).toContain('야구');
    expect(out.a2uiEnvelope).toBeDefined();
  });

  it('score 인데 DB 없음(scoreData=null) → reaction 미생성, 폴백 카드만', async () => {
    // P2-W5.5: 경기 정보 없음 경로 — TeamPersona 가 reaction 을 만들지 않고(undefined),
    //   EmitA2UI 가 폴백 텍스트 카드로 응답한다(reaction 슬롯 자체 없음).
    delete process.env.GOOGLE_API_KEY;
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '지금 몇 대 몇이야' }],
      userMessage: '지금 몇 대 몇이야',
    });
    expect(out.intent).toBe('score');
    expect(out.scoreData).toBeNull();
    expect(out.reaction).toBeUndefined();
    // 폴백 카드: 단일 Text root, 점수 데이터 미주입.
    const ops = out.a2uiEnvelope as Array<Record<string, unknown>>;
    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    expect(compOp?.updateComponents.components).toHaveLength(1);
  });

  it('chat 질의(키 없음) → 캔드 AIMessage + 단일 Text 카드', async () => {
    delete process.env.GOOGLE_API_KEY;
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '안녕' }],
      userMessage: '안녕',
    });
    expect(out.intent).toBe('chat');
    const last = out.messages[out.messages.length - 1];
    expect(String(last.content)).toContain('밧디(스켈레톤)');
    // chat은 단일 Text 카드 (createSurface + updateComponents)
    expect(out.a2uiEnvelope).toBeDefined();
    expect((out.a2uiEnvelope as unknown[]).length).toBeGreaterThanOrEqual(2);
  });
});
