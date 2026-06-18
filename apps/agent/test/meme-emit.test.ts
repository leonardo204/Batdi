/**
 * emitA2UI — meme intent 분기 단위테스트 (P3-W8 8.2)
 *
 *  - intent='meme' + memeContent 주입 → 단일 Text 카드(root Text, content 포함) +
 *    AIMessage(memeContent). chat(LLM, generateChatReply)으로 빠지지 않음을 검증한다.
 *  - 밈은 랜덤(비결정)이라 L0 캐시 write 하지 않음(emit meme 분기 write 생략).
 *
 * generateChatReply 가 호출되면 안 되므로 spy 로 0회 호출을 단언한다.
 */
import { describe, it, expect, vi } from 'vitest';
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

describe('emitA2UI — meme intent → 밈 단일 Text 카드', () => {
  it('memeContent 주입 → 단일 Text 카드 + AIMessage(content), chat LLM 미호출', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');

    const update = await emitA2UI(makeMemeState());

    // chat(LLM) 경로로 빠지지 않았다.
    expect(chatSpy).not.toHaveBeenCalled();

    // 단일 Text 카드: createSurface + updateComponents(단일 Text root) [+ updateDataModel].
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    expect(compOp?.updateComponents.components).toHaveLength(1);
    expect(compOp?.updateComponents.components[0]).toMatchObject({
      id: 'root',
      component: 'Text',
    });

    // AIMessage 에 밈 content 가 담긴다.
    const msgs = update.messages as Array<{ content: unknown }> | undefined;
    expect(msgs).toBeDefined();
    expect(String(msgs?.[msgs.length - 1]?.content)).toContain(
      '사직 가면 다 부산 사나이',
    );

    chatSpy.mockRestore();
  });

  it('memeContent 비어있으면 방어적 폴백 문구로 단일 Text 카드(chat 미호출)', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');

    const update = await emitA2UI(makeMemeState({ memeContent: '' }));

    expect(chatSpy).not.toHaveBeenCalled();
    const msgs = update.messages as Array<{ content: unknown }> | undefined;
    expect(String(msgs?.[msgs.length - 1]?.content)).not.toBe('');

    chatSpy.mockRestore();
  });
});
