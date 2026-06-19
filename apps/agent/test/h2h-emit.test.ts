/**
 * emitA2UI — h2h intent 분기 단위테스트 (ADR-057)
 *
 *  - intent='h2h' + headToHeadData 주입 → h2h_compact 카드(rows 주입, root Column + title + 9줄).
 *    chat(LLM, generateChatReply) 미호출.
 *  - headToHeadData == null → 팀 톤 폴백 단일 Text 카드 + AIMessage. L0 캐시 write 안 함(데이터 부재).
 *
 * news-emit.test.ts 평행 패턴.
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
import { HEAD_TO_HEAD_COMPACT_TEMPLATE_ID } from '../src/templates/h2h_compact';

function makeH2HState(over: Partial<CoreGraphState> = {}): CoreGraphState {
  return {
    messages: [],
    userMessage: '상대전적 보여줘',
    userMessageNormalized: '상대전적보여줘',
    userMessageDisplay: '상대전적 보여줘',
    userId: 'u1',
    teamId: 'lg',
    inputGuardrailResult: { pass: true },
    outputGuardrailResult: undefined,
    intent: 'h2h',
    intentConfidence: 'high',
    complexity: 'simple',
    cacheHit: 'miss',
    headToHeadData: {
      // h2h_compact 는 rows.0.line..rows.8.line 9슬롯 전부 바인딩하므로 9건 채운다.
      rows: Array.from({ length: 9 }, (_, n) => ({
        line: `vs 상대${n} ${n}승${n}패0무`,
      })),
    },
    a2uiEnvelope: undefined,
    llmCallCount: undefined,
    traceId: undefined,
    ...over,
  } as unknown as CoreGraphState;
}

describe('emitA2UI — h2h intent → h2h_compact 카드', () => {
  it('headToHeadData 있으면 h2h_compact ops(rows 주입) 방출 + 카드 dispatch, chat LLM 미호출', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');
    dispatchMock.mockClear();

    const update = await emitA2UI(makeH2HState());

    expect(chatSpy).not.toHaveBeenCalled();
    expect(dispatchMock).toHaveBeenCalledTimes(1);

    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    // h2h_compact: root Column + title + 9 row = 11 노드(단일 Text 폴백이 아님).
    expect(compOp?.updateComponents.components.length).toBeGreaterThan(1);

    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: { rows?: unknown[] } } }
      | undefined;
    expect(dataOp?.updateDataModel.value.rows).toHaveLength(9);

    chatSpy.mockRestore();
  });

  it('headToHeadData == null → 팀 톤 폴백 AIMessage 버블만(카드·chat 미호출)', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');
    dispatchMock.mockClear();

    const update = await emitA2UI(makeH2HState({ headToHeadData: null }));

    expect(chatSpy).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(update.a2uiEnvelope).toEqual([]);

    const msgs = update.messages as Array<{ content: unknown }> | undefined;
    expect(msgs).toBeDefined();
    expect(msgs).toHaveLength(1);
    expect(String(msgs?.[msgs.length - 1]?.content)).not.toBe('');

    chatSpy.mockRestore();
  });

  it('h2h_compact 템플릿 식별자는 h2h_compact 다(회귀 가드)', () => {
    expect(HEAD_TO_HEAD_COMPACT_TEMPLATE_ID).toBe('h2h_compact');
  });
});
