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
    // 텍스트-only 폴백: render_a2ui 카드 미방출(envelope 빈 배열). AIMessage 버블로만 표시.
    expect(out.a2uiEnvelope).toEqual([]);
    // 폴백 AIMessage 가 응답을 대신한다.
    const last = out.messages[out.messages.length - 1];
    expect(String(last.content)).toContain('경기 정보가 없');
  });

  it('가드레일 차단(일베) → intentRouter 우회, fallbackResponse AIMessage 버블만(카드 없음)', async () => {
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '일베 짤 보여줘' }],
      userMessage: '일베 짤 보여줘',
    });
    expect(out.inputGuardrailResult?.pass).toBe(false);
    expect(out.inputGuardrailResult?.violationType).toBe('ilbe_expression');
    // intentRouter 가 우회되어 intent 는 set 되지 않거나 기본값 유지
    const last = out.messages[out.messages.length - 1];
    expect(String(last.content)).toContain('야구');
    // 텍스트-only 차단 응답: render_a2ui 카드 미방출(envelope 빈 배열).
    expect(out.a2uiEnvelope).toEqual([]);
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
    // 텍스트-only 폴백: render_a2ui 카드 미방출(envelope 빈 배열), AIMessage 버블로만 표시.
    expect(out.a2uiEnvelope).toEqual([]);
  });

  it('순위 질의(DB 없음) → stats DataFallbackHandler 단일 Text 폴백 카드 + AIMessage', async () => {
    // 테스트 env 는 DATABASE_URL='' → fetchStandings=null(best-effort).
    //   stats intent 인데 순위 실데이터 없음 → standings 카드 대신 팀 톤 폴백 텍스트 카드.
    //   (실데이터 주입 경로 검증은 stats-emit.test.ts 의 emitA2UI 단위테스트가 담당.)
    delete process.env.GOOGLE_API_KEY;
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '순위 알려줘' }],
      userMessage: '순위 알려줘',
    });
    expect(out.intent).toBe('stats');
    expect(out.standingsData).toBeNull();
    // 텍스트-only 폴백: render_a2ui 카드 미방출(envelope 빈 배열), AIMessage 버블로만 표시.
    expect(out.a2uiEnvelope).toEqual([]);
    const last = out.messages[out.messages.length - 1];
    expect(String(last.content)).toContain('순위 정보가 없');
  });

  it('타율 질의(DB 없음) → stats statType=player + 선수 기록 폴백 카드 (P3-W7 7.3b)', async () => {
    // 테스트 env 는 DATABASE_URL='' → fetchPlayerLeaderboard=null(best-effort).
    //   stats intent + statType=player → 순위가 아니라 선수 리더보드 분기로 라우팅되고,
    //   실데이터 없음 → standings 폴백이 아닌 player 폴백("선수 기록이 없")을 방출한다.
    delete process.env.GOOGLE_API_KEY;
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '타율 어때' }],
      userMessage: '타율 어때',
    });
    expect(out.intent).toBe('stats');
    expect(out.statType).toBe('player'); // 순위 아닌 선수 분기로 배선됨
    expect(out.playerStats).toBeNull();
    // 텍스트-only 폴백: render_a2ui 카드 미방출(envelope 빈 배열), AIMessage 버블로만 표시.
    expect(out.a2uiEnvelope).toEqual([]);
    const last = out.messages[out.messages.length - 1];
    expect(String(last.content)).toContain('선수 기록이 없');
  });

  it('밈 질의(DB 없음) → meme STATIC 폴백 밈 카드 + AIMessage (P3-W8 8.2)', async () => {
    // 테스트 env 는 DATABASE_URL='' → fetchRandomMeme=STATIC_MEMES 폴백(best-effort).
    //   meme intent → ServiceData(fetchRandomMeme) → memeContent → EmitA2UI meme 분기
    //   단일 Text 밈 카드 + AIMessage. chat(LLM) 폴백으로 빠지지 않는다.
    delete process.env.GOOGLE_API_KEY;
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '밈 보여줘' }],
      userMessage: '밈 보여줘',
      teamId: 'lotte',
    });
    expect(out.intent).toBe('meme');
    expect(out.memeContent).toBeDefined();
    expect(typeof out.memeContent).toBe('string');
    expect((out.memeContent as string).trim()).not.toBe('');
    // 텍스트-only 밈: render_a2ui 카드 미방출(envelope 빈 배열), AIMessage 버블로만 표시.
    expect(out.a2uiEnvelope).toEqual([]);
    // AIMessage = 밈 텍스트(= memeContent). 폴백 밈이라 비어있지 않다.
    const last = out.messages[out.messages.length - 1];
    expect(String(last.content)).toBe(out.memeContent);
    expect(String(last.content).length).toBeGreaterThan(0);
  });

  it('composite 질의(키 없음, DB 없음) → L3 null → 대표 intent L1 폴백 (P3-W9 9.1)', async () => {
    // "스코어랑 순위 같이" → score+stats 매칭 → complexity=composite.
    // 키 없음 → composeL3=null. DB 없음 → scoreData/standingsData=null →
    //   buildCompositeFallback 이 대표 intent(score) 데이터 없음 → 단일 Text 폴백 카드.
    //   그래프가 throw 없이 정상 종단(L1 폴백)함을 검증.
    delete process.env.GOOGLE_API_KEY;
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '스코어랑 순위 같이 알려줘' }],
      userMessage: '스코어랑 순위 같이 알려줘',
    });
    expect(out.complexity).toBe('composite');
    expect(out.matchedIntents).toContain('score');
    expect(out.matchedIntents).toContain('stats');
    expect(out.a2uiEnvelope).toBeDefined();
    const ops = out.a2uiEnvelope as Array<Record<string, unknown>>;
    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    // 대표 intent(score) 데이터 없음(DB 없음) → 단일 Text 폴백 카드.
    expect(compOp?.updateComponents.components).toHaveLength(1);
    expect(JSON.stringify(out.a2uiEnvelope)).toContain('createSurface');
  });

  it('chat 질의(키 없음) → 팀톤 캔드 AIMessage 버블만(카드 없음)', async () => {
    delete process.env.GOOGLE_API_KEY;
    const out = await graph.invoke({
      messages: [{ role: 'user', content: '안녕' }],
      userMessage: '안녕',
    });
    expect(out.intent).toBe('chat');
    const last = out.messages[out.messages.length - 1];
    // P3-W8 8.1: 키 없으면 스켈레톤 stub 가 아니라 팀톤 캔드(hanwha 폴백)로 응답한다.
    expect(String(last.content)).not.toContain('스켈레톤');
    expect(String(last.content)).toContain('응원해유');
    // 텍스트-only chat: render_a2ui 카드 미방출(envelope 빈 배열), AIMessage 버블로만 표시.
    expect(out.a2uiEnvelope).toEqual([]);
  });
});
