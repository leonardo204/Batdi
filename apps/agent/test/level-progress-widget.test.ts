/**
 * A2UI 위젯 levelProgressWidget(P3-W8 8.3, ADR-046) 구조/게이트 테스트
 *
 * 기본 카탈로그 근사 — 사전 포맷 progress 문자열 단일 Text bind(progress bar 미등록).
 */
import { describe, it, expect } from 'vitest';
import {
  validateBatdiA2UI,
  MAX_NODES,
  MAX_DEPTH,
  BATDI_CATALOG_COMPONENT_NAMES,
} from '@batdi/a2ui-schema';
import { compileBindings } from '../src/databind/compile';
import {
  LEVEL_PROGRESS_COMPONENTS,
  LEVEL_PROGRESS_BIND_SCHEMA,
  LEVEL_PROGRESS_WIDGET_ID,
} from '../src/templates/level_progress_widget';

const BASIC_5 = ['Text', 'Row', 'Column', 'Button', 'TextField'];

const DATA_MODEL: Record<string, unknown> = {
  level: { currentLevel: 'Lv.7', bar: '███░░ 60%', xp: '1200 / 2000 XP' },
};

describe('levelProgressWidget — 구조 + 게이트', () => {
  it('위젯 식별자', () => {
    expect(LEVEL_PROGRESS_WIDGET_ID).toBe('level_progress_widget');
  });

  it("root id='root' Column + children [title, level_row, bar_text, xp_text]", () => {
    const root = LEVEL_PROGRESS_COMPONENTS.find((c) => c.id === 'root');
    expect(root?.id).toBe('root');
    expect(root?.component).toBe('Column');
    expect(root?.children).toEqual(['title', 'level_row', 'bar_text', 'xp_text']);
  });

  it('level_row Row children [level_label, level_value]', () => {
    const row = LEVEL_PROGRESS_COMPONENTS.find((c) => c.id === 'level_row');
    expect(row?.component).toBe('Row');
    expect(row?.children).toEqual(['level_label', 'level_value']);
  });

  it('기본 카탈로그 5종 컴포넌트만 사용', () => {
    for (const node of LEVEL_PROGRESS_COMPONENTS) {
      expect(BASIC_5).toContain(node.component as string);
      expect(BATDI_CATALOG_COMPONENT_NAMES).toContain(node.component as string);
    }
  });

  it('bindSchema 가 기대 경로 배열과 일치', () => {
    expect(LEVEL_PROGRESS_BIND_SCHEMA).toEqual([
      'level.currentLevel',
      'level.bar',
      'level.xp',
    ]);
  });

  it('데이터 주입 시 valid + 노드/깊이 게이트 통과', () => {
    const compiled = compileBindings(LEVEL_PROGRESS_COMPONENTS);
    const result = validateBatdiA2UI({
      components: compiled,
      data: DATA_MODEL,
      validateBindings: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(LEVEL_PROGRESS_COMPONENTS.length).toBeLessThanOrEqual(MAX_NODES);
    expect(
      result.errors.some(
        (e) => e.code === 'max_nodes_exceeded' || e.code === 'max_depth_exceeded',
      ),
    ).toBe(false);
    expect(MAX_DEPTH).toBe(4);
  });
});
