/**
 * emitA2UI — schedule/lineup intent 분기 단위테스트 (ADR-052)
 *
 *  - intent='schedule' + scheduleData 주입 → schedule_compact 카드(date + rows 주입).
 *    chat(LLM, generateChatReply) 미호출.
 *  - scheduleData == null → 팀 톤 폴백 단일 Text 카드 + AIMessage. L0 write 안 함.
 *  - intent='lineup' + lineupData == null(정상 경로) → "라인업 경기 임박 시 공개" 폴백 카드.
 *  - intent='lineup' + lineupData 주입 → lineup_compact 카드(team + rows 주입).
 *
 * DATABASE_URL='' 테스트 env 라 writeL0Cache 는 getPrisma=undefined 로 자연 skip(부수효과 없음).
 */
import { describe, it, expect, vi } from 'vitest';
import { emitA2UI } from '../src/nodes/emit-a2ui';
import * as chatMod from '../src/services/chat-graph';
import type { CoreGraphState } from '../src/state';
import { SCHEDULE_COMPACT_TEMPLATE_ID } from '../src/templates/schedule_compact';
import { LINEUP_COMPACT_TEMPLATE_ID } from '../src/templates/lineup_compact';

function makeState(over: Partial<CoreGraphState> = {}): CoreGraphState {
  return {
    messages: [],
    userMessage: '일정 알려줘',
    userMessageNormalized: '일정알려줘',
    userMessageDisplay: '일정 알려줘',
    userId: 'u1',
    teamId: 'hanwha',
    inputGuardrailResult: { pass: true },
    outputGuardrailResult: undefined,
    intent: 'schedule',
    intentConfidence: 'high',
    complexity: 'simple',
    cacheHit: 'miss',
    a2uiEnvelope: undefined,
    llmCallCount: undefined,
    traceId: undefined,
    ...over,
  } as unknown as CoreGraphState;
}

function ops(update: { a2uiEnvelope?: unknown }): Array<Record<string, unknown>> {
  return update.a2uiEnvelope as Array<Record<string, unknown>>;
}

function components(
  o: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const compOp = o.find((x) => 'updateComponents' in x) as
    | { updateComponents: { components: Array<Record<string, unknown>> } }
    | undefined;
  return compOp?.updateComponents.components ?? [];
}

function dataModel(o: Array<Record<string, unknown>>): Record<string, unknown> {
  const dataOp = o.find((x) => 'updateDataModel' in x) as
    | { updateDataModel: { value: Record<string, unknown> } }
    | undefined;
  return dataOp?.updateDataModel.value ?? {};
}

describe('emitA2UI — schedule intent → schedule_compact 카드', () => {
  it('scheduleData 있으면 schedule_compact ops(date+rows 주입), chat 미호출', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');

    const scheduleData = {
      date: '6월 18일 기준',
      rows: [
        { line: '6/18(수) 한화 vs 두산 · 대전/18:30' },
        { line: '6/19(금) 한화 vs 롯데 · 대전/18:30' },
        { line: ' ' },
        { line: ' ' },
        { line: ' ' },
      ],
    };
    const update = await emitA2UI(makeState({ scheduleData }));

    expect(chatSpy).not.toHaveBeenCalled();
    const o = ops(update);
    // schedule_compact: root Column + title + date + 5 row = 8 노드(단일 Text 폴백 아님).
    expect(components(o).length).toBeGreaterThan(1);

    const value = dataModel(o);
    expect(value.date).toBe('6월 18일 기준');
    expect(value.rows).toHaveLength(5);

    chatSpy.mockRestore();
  });

  it('scheduleData == null → 팀 톤 폴백 단일 Text 카드 + AIMessage(chat 미호출)', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');

    const update = await emitA2UI(makeState({ scheduleData: null }));

    expect(chatSpy).not.toHaveBeenCalled();
    const o = ops(update);
    expect(components(o)).toHaveLength(1);
    expect(components(o)[0]).toMatchObject({ id: 'root', component: 'Text' });

    const msgs = update.messages as Array<{ content: unknown }> | undefined;
    expect(String(msgs?.[msgs.length - 1]?.content)).not.toBe('');

    chatSpy.mockRestore();
  });

  it('schedule_compact 템플릿 식별자 회귀 가드', () => {
    expect(SCHEDULE_COMPACT_TEMPLATE_ID).toBe('schedule_compact');
  });
});

describe('emitA2UI — lineup intent → lineup_compact 카드 / 폴백', () => {
  it('lineupData == null(정상 경로) → 팀 톤 폴백 단일 Text 카드 + AIMessage', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');

    const update = await emitA2UI(
      makeState({ intent: 'lineup', lineupData: null }),
    );

    expect(chatSpy).not.toHaveBeenCalled();
    const o = ops(update);
    expect(components(o)).toHaveLength(1);
    expect(components(o)[0]).toMatchObject({ id: 'root', component: 'Text' });

    const msgs = update.messages as Array<{ content: unknown }> | undefined;
    // "라인업" 안내 문구 포함.
    expect(String(msgs?.[msgs.length - 1]?.content)).toContain('라인업');

    chatSpy.mockRestore();
  });

  it('lineupData 있으면 lineup_compact ops(team+rows 주입), chat 미호출', async () => {
    const chatSpy = vi.spyOn(chatMod, 'generateChatReply');

    const lineupData = {
      team: '두산',
      rows: Array.from({ length: 9 }, (_, n) => ({
        line: `${n + 1}번 (중) 선수${n + 1}`,
      })),
    };
    const update = await emitA2UI(
      makeState({ intent: 'lineup', lineupData }),
    );

    expect(chatSpy).not.toHaveBeenCalled();
    const o = ops(update);
    // lineup_compact: root Column + title + team + 9 row = 12 노드.
    expect(components(o).length).toBeGreaterThan(1);

    const value = dataModel(o);
    expect(value.team).toBe('두산');
    expect(value.rows).toHaveLength(9);

    chatSpy.mockRestore();
  });

  it('lineup_compact 템플릿 식별자 회귀 가드', () => {
    expect(LINEUP_COMPACT_TEMPLATE_ID).toBe('lineup_compact');
  });
});
