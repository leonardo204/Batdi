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

  it('score 질의 → a2uiEnvelope(3 ops) + AIMessage(요약) 반환', async () => {
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '지금 몇 대 몇이야' }],
      userMessage: '지금 몇 대 몇이야',
    });
    expect(out.intent).toBe('score');
    expect(out.cacheHit).toBe('miss');
    expect(out.complexity).toBe('simple');
    // A2UI envelope: 3 ops (valid score 템플릿) — state 디버그 채널.
    // W2-B: 실제 렌더 transport 는 manually_emit_tool_call 커스텀 이벤트로 나가므로
    // (graph.invoke 는 커스텀 이벤트를 포착하지 않음) 여기서는 state 채널만 검증한다.
    // 팩트 값(롯데/두산)이 ops 의 updateDataModel value 에 실렸는지 확인.
    expect(out.a2uiEnvelope).toBeDefined();
    expect(out.a2uiEnvelope).toHaveLength(3);
    expect(JSON.stringify(out.a2uiEnvelope)).toContain('롯데');
    expect(JSON.stringify(out.a2uiEnvelope)).toContain('두산');
    expect(JSON.stringify(out.a2uiEnvelope)).toContain('createSurface');
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

  it('dataBinder→teamPersona→outputGuardrail→emitA2UI E2E: score 캔드 리액션이 /reaction 에 주입(수치 없음)', async () => {
    delete process.env.GOOGLE_API_KEY;
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '지금 몇 대 몇이야' }],
      userMessage: '지금 몇 대 몇이야',
    });
    expect(out.intent).toBe('score');
    // TeamPersona 가 캔드 리액션 생성 → OutputGuardrail 통과 → state.reaction 보관.
    expect(out.outputGuardrailResult?.pass).toBe(true);
    expect(typeof out.reaction).toBe('string');
    expect(out.reaction).not.toMatch(/[0-9]/);
    // EmitA2UI 가 /reaction 슬롯에 주입.
    const ops = out.a2uiEnvelope as Array<Record<string, unknown>>;
    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: Record<string, unknown> } }
      | undefined;
    expect(dataOp?.updateDataModel.value.reaction).toBe(out.reaction);
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
