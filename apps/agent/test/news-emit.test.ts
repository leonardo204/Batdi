/**
 * emitA2UI — news intent 분기 단위테스트 (P3-W7 7.5 ADR-048)
 *
 *  - intent='news' + newsData 주입 → news_compact 카드(rows 주입, root Column + title + 5줄).
 *    chat(LLM, generateChatReply) 미호출.
 *  - newsData == null → 팀 톤 폴백 단일 Text 카드 + AIMessage. L0 캐시 write 안 함(데이터 부재).
 *
 * DATABASE_URL='' 테스트 env 라 writeL0Cache 는 getPrisma=undefined 로 자연 skip(부수효과 없음).
 */
import { describe, it, expect, vi } from 'vitest';

// render_a2ui 카드 방출(dispatchCustomEvent) 횟수로 "카드 분기 1회 / 텍스트 폴백 0회"를 검증.
const dispatchMock = vi.fn(async () => undefined);
vi.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: (...args: unknown[]) => dispatchMock(...args),
}));

import { emitA2UI } from '../src/nodes/emit-a2ui';
import * as chatMod from '../src/services/chat-graph';
import type { CoreGraphState } from '../src/state';
import { NEWS_COMPACT_TEMPLATE_ID } from '../src/templates/news_compact';

function makeNewsState(over: Partial<CoreGraphState> = {}): CoreGraphState {
  return {
    messages: [],
    userMessage: '뉴스 보여줘',
    userMessageNormalized: '뉴스보여줘',
    userMessageDisplay: '뉴스 보여줘',
    userId: 'u1',
    teamId: 'hanwha',
    inputGuardrailResult: { pass: true },
    outputGuardrailResult: undefined,
    intent: 'news',
    intentConfidence: 'high',
    complexity: 'simple',
    cacheHit: 'miss',
    newsData: {
      // news_compact 는 rows.0.line..rows.4.line 5슬롯 전부 바인딩하므로 5건 채운다.
      rows: [
        { line: '한화 위닝시리즈 — 스포츠경향' },
        { line: '이글스 마무리 안정세 — 뉴스1' },
        { line: '선발 호투 — 연합뉴스' },
        { line: '타선 폭발 — OSEN' },
        { line: '불펜 안정 — 스포티비' },
      ],
    },
    a2uiEnvelope: undefined,
    llmCallCount: undefined,
    traceId: undefined,
    ...over,
  } as unknown as CoreGraphState;
}

describe('emitA2UI — news intent → news_compact 카드', () => {
  it('newsData 있으면 news_compact ops(rows 주입) 방출 + 카드 dispatch, chat LLM 미호출', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');
    dispatchMock.mockClear();

    const update = await emitA2UI(makeNewsState());

    expect(chatSpy).not.toHaveBeenCalled();
    // 카드-데이터 경로: render_a2ui 카드를 1회 dispatch 한다.
    expect(dispatchMock).toHaveBeenCalledTimes(1);

    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    // createSurface 에 news_compact 표식이 있거나(컴포넌트가 다수) → 텍스트 폴백(단일) 아님.
    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    // news_compact: root Column + title + 5 row = 7 노드(단일 Text 폴백이 아님).
    expect(compOp?.updateComponents.components.length).toBeGreaterThan(1);

    // 데이터 모델에 rows 주입.
    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: { rows?: unknown[] } } }
      | undefined;
    expect(dataOp?.updateDataModel.value.rows).toHaveLength(5);

    chatSpy.mockRestore();
  });

  it('newsData == null → 팀 톤 폴백 AIMessage 버블만(카드·chat 미호출)', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');
    dispatchMock.mockClear();

    const update = await emitA2UI(makeNewsState({ newsData: null }));

    expect(chatSpy).not.toHaveBeenCalled();
    // 텍스트-only 폴백: render_a2ui 카드 미방출(dispatch 0회 + envelope 빈 배열).
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(update.a2uiEnvelope).toEqual([]);

    const msgs = update.messages as Array<{ content: unknown }> | undefined;
    expect(msgs).toBeDefined();
    expect(msgs).toHaveLength(1);
    expect(String(msgs?.[msgs.length - 1]?.content)).not.toBe('');

    chatSpy.mockRestore();
  });

  it('news_compact 템플릿 식별자는 news_compact 다(회귀 가드)', () => {
    expect(NEWS_COMPACT_TEMPLATE_ID).toBe('news_compact');
  });
});
