/**
 * emitA2UI — meme intent 분기 단위테스트 (P3-W8 8.2)
 *
 *  - intent='meme' + memeContent 주입 → AIMessage(memeContent) 버블 하나만.
 *    chat(LLM, generateChatReply)으로 빠지지 않음을 검증한다.
 *  - 밈은 텍스트-only 응답이라 render_a2ui Text 카드를 내지 않는다(중복 표시 방지).
 *    → dispatchCustomEvent 0회, a2uiEnvelope 는 빈 배열.
 *  - 밈은 랜덤(비결정)이라 L0 캐시 write 하지 않음(emit meme 분기 write 생략).
 *
 * generateChatReply 가 호출되면 안 되므로 spy 로 0회 호출을 단언한다.
 */
import { describe, it, expect, vi } from 'vitest';

// render_a2ui 카드 방출은 dispatchCustomEvent 로 일어난다. ESM 네임스페이스는 spyOn 불가라
// 모듈을 모킹해 "텍스트 분기 → dispatch 0회 / 카드 분기 → dispatch 1회"를 검증한다.
const dispatchMock = vi.fn(async () => undefined);
vi.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: (...args: unknown[]) => dispatchMock(...args),
}));

import { emitA2UI } from '../src/nodes/emit-a2ui';
import * as chatMod from '../src/services/chat-graph';
import type { CoreGraphState } from '../src/state';

function makeMemeState(over: Partial<CoreGraphState> = {}): CoreGraphState {
  return {
    messages: [],
    userMessage: '밈 보여줘',
    userMessageNormalized: '밈보여줘',
    userMessageDisplay: '밈 보여줘',
    userId: 'u1',
    teamId: 'lotte',
    inputGuardrailResult: { pass: true },
    outputGuardrailResult: undefined,
    intent: 'meme',
    intentConfidence: 'high',
    complexity: 'simple',
    cacheHit: 'miss',
    memeContent: '마! 사직 가면 다 부산 사나이 아이가~',
    a2uiEnvelope: undefined,
    llmCallCount: undefined,
    traceId: undefined,
    ...over,
  } as unknown as CoreGraphState;
}

describe('emitA2UI — meme intent → 밈 AIMessage 버블 (카드 없음)', () => {
  it('memeContent 주입 → AIMessage(content) 버블만, 카드(dispatch) 미방출, chat LLM 미호출', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');
    dispatchMock.mockClear();

    const update = await emitA2UI(makeMemeState());

    // chat(LLM) 경로로 빠지지 않았다.
    expect(chatSpy).not.toHaveBeenCalled();

    // 텍스트-only 응답: render_a2ui Text 카드를 내지 않는다(dispatch 0회 + envelope 빈 배열).
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(update.a2uiEnvelope).toEqual([]);

    // AIMessage 에 밈 content 가 담긴다(버블 하나).
    const msgs = update.messages as Array<{ content: unknown }> | undefined;
    expect(msgs).toBeDefined();
    expect(msgs).toHaveLength(1);
    expect(String(msgs?.[msgs.length - 1]?.content)).toContain(
      '사직 가면 다 부산 사나이',
    );

    chatSpy.mockRestore();
  });

  it('memeContent 비어있으면 방어적 폴백 문구로 AIMessage 버블만(카드·chat 미호출)', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');
    dispatchMock.mockClear();

    const update = await emitA2UI(makeMemeState({ memeContent: '' }));

    expect(chatSpy).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(update.a2uiEnvelope).toEqual([]);
    const msgs = update.messages as Array<{ content: unknown }> | undefined;
    expect(String(msgs?.[msgs.length - 1]?.content)).not.toBe('');

    chatSpy.mockRestore();
  });
});
