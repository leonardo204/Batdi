/**
 * WIDGET_REGISTRY / resolveWidget(P3-W8 8.3, ADR-046) 테스트
 *
 *  - 신규 5종 위젯이 레지스트리에 모두 존재 + resolveWidget 동작.
 *  - 전 위젯 컴파일+검증 valid(게이트 통과). 미등록 widgetId → undefined.
 */
import { describe, it, expect } from 'vitest';
import {
  validateBatdiA2UI,
  MAX_NODES,
  BATDI_CATALOG_COMPONENT_NAMES,
} from '@batdi/a2ui-schema';
import { compileBindings } from '../src/databind/compile';
import { WIDGET_REGISTRY, resolveWidget } from '../src/templates/registry';
import { PLAYER_CHIP_WIDGET_ID } from '../src/templates/player_chip_widget';
import { GAME_SCHEDULE_WIDGET_ID } from '../src/templates/game_schedule_widget';
import { HEAD_TO_HEAD_WIDGET_ID } from '../src/templates/head_to_head_widget';
import { TREND_SPARKLINE_WIDGET_ID } from '../src/templates/trend_sparkline_widget';
import { LEVEL_PROGRESS_WIDGET_ID } from '../src/templates/level_progress_widget';

const BASIC_5 = ['Text', 'Row', 'Column', 'Button', 'TextField'];

/** bindSchema 점경로들을 채운 샘플 데이터모델 생성(점경로 → 중첩 객체) */
function dataModelFor(bindSchema: ReadonlyArray<string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const path of bindSchema) {
    const parts = path.split('.');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i] as string;
      if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = {};
      cur = cur[key] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1] as string] = 'X';
  }
  return root;
}

const ALL_WIDGET_IDS = [
  PLAYER_CHIP_WIDGET_ID,
  GAME_SCHEDULE_WIDGET_ID,
  HEAD_TO_HEAD_WIDGET_ID,
  TREND_SPARKLINE_WIDGET_ID,
  LEVEL_PROGRESS_WIDGET_ID,
];

describe('WIDGET_REGISTRY — 5종 등록', () => {
  it('신규 5종 위젯이 모두 존재', () => {
    expect(Object.keys(WIDGET_REGISTRY).sort()).toEqual([...ALL_WIDGET_IDS].sort());
  });

  it('각 엔트리 widgetId 가 key 와 일치', () => {
    for (const [key, widget] of Object.entries(WIDGET_REGISTRY)) {
      expect(widget.widgetId).toBe(key);
    }
  });

  it.each(ALL_WIDGET_IDS)('resolveWidget(%s) 동작', (id) => {
    const widget = resolveWidget(id);
    expect(widget).toBeDefined();
    expect(widget?.widgetId).toBe(id);
  });

  it('미등록 widgetId → undefined', () => {
    expect(resolveWidget('nonexistent_widget')).toBeUndefined();
  });

  it.each(ALL_WIDGET_IDS)('%s — 컴파일+검증 valid + 게이트 + 기본 5종', (id) => {
    const widget = resolveWidget(id);
    expect(widget).toBeDefined();
    if (!widget) return;
    const root = widget.components.find((c) => c.id === 'root');
    expect(root?.id).toBe('root');
    for (const node of widget.components) {
      expect(BASIC_5).toContain(node.component as string);
      expect(BATDI_CATALOG_COMPONENT_NAMES).toContain(node.component as string);
    }
    const compiled = compileBindings(widget.components);
    const result = validateBatdiA2UI({
      components: compiled,
      data: dataModelFor(widget.bindSchema),
      validateBindings: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(widget.components.length).toBeLessThanOrEqual(MAX_NODES);
  });
});
