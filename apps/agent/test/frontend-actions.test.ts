/**
 * frontend-actions.test.ts — extractFrontendActions 단위테스트 (P4-W10 10.1 ADR-050).
 *
 *  - render_a2ui / log_a2ui_event 예약 툴은 제외(미들웨어 소유).
 *  - 두 가지 raw 형태(함수 래퍼 / flat) 모두 정규화.
 *  - tools 우선, 없으면 copilotkit.actions, 둘 다 없으면 [].
 */
import { describe, it, expect } from 'vitest';
import { extractFrontendActions } from '../src/services/frontend-actions';
import type { CoreGraphState } from '../src/state';

type ActionsState = Pick<CoreGraphState, 'tools' | 'copilotkit'>;

function stateWith(over: Partial<ActionsState>): ActionsState {
  return { tools: undefined, copilotkit: undefined, ...over } as ActionsState;
}

describe('extractFrontendActions', () => {
  it('빈/누락 → []', () => {
    expect(extractFrontendActions(stateWith({}))).toEqual([]);
    expect(extractFrontendActions(stateWith({ tools: [] }))).toEqual([]);
  });

  it('flat 형태({name,description,parameters}) 정규화', () => {
    const result = extractFrontendActions(
      stateWith({
        tools: [
          {
            name: 'registerFavoritePlayer',
            description: '관심 선수 등록',
            parameters: { type: 'object', properties: { playerId: { type: 'number' } } },
          },
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'registerFavoritePlayer',
      description: '관심 선수 등록',
      parameters: { type: 'object', properties: { playerId: { type: 'number' } } },
    });
  });

  it('함수 래퍼 형태({type:function,function:{...}}) 정규화', () => {
    const result = extractFrontendActions(
      stateWith({
        tools: [
          {
            type: 'function',
            function: {
              name: 'registerFavoritePlayer',
              description: '관심 선수 등록',
              parameters: { type: 'object' },
            },
          },
        ],
      }),
    );
    expect(result).toEqual([
      {
        name: 'registerFavoritePlayer',
        description: '관심 선수 등록',
        parameters: { type: 'object' },
      },
    ]);
  });

  it('render_a2ui / log_a2ui_event 예약 툴은 제외', () => {
    const result = extractFrontendActions(
      stateWith({
        tools: [
          { name: 'render_a2ui', description: 'x', parameters: {} },
          { name: 'log_a2ui_event', description: 'y', parameters: {} },
          { name: 'registerFavoritePlayer', description: 'z', parameters: {} },
        ],
      }),
    );
    expect(result.map((a) => a.name)).toEqual(['registerFavoritePlayer']);
  });

  it('tools 없으면 copilotkit.actions 폴백', () => {
    const result = extractFrontendActions(
      stateWith({
        copilotkit: {
          actions: [{ name: 'registerFavoritePlayer', description: 'd', parameters: {} }],
        },
      }),
    );
    expect(result.map((a) => a.name)).toEqual(['registerFavoritePlayer']);
  });

  it('name 없는 항목/비객체는 스킵, parameters/description 누락은 기본값', () => {
    const result = extractFrontendActions(
      stateWith({
        tools: [
          null,
          'not-an-object',
          { description: 'no name' },
          { name: 'onlyName' },
        ] as unknown[],
      }),
    );
    expect(result).toEqual([
      { name: 'onlyName', description: '', parameters: {} },
    ]);
  });
});
