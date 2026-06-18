/**
 * A2UI 위젯 headToHeadWidget(P3-W8 8.3, ADR-046) 구조/게이트 테스트
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
  HEAD_TO_HEAD_COMPONENTS,
  HEAD_TO_HEAD_BIND_SCHEMA,
  HEAD_TO_HEAD_WIDGET_ID,
} from '../src/templates/head_to_head_widget';

const BASIC_5 = ['Text', 'Row', 'Column', 'Button', 'TextField'];

const DATA_MODEL: Record<string, unknown> = {
  h2h: {
    playerA: { name: '구자욱' },
    playerB: { name: '나성범' },
    rows: [
      { a: '0.320', label: '타율', b: '0.305' },
      { a: '25', label: '홈런', b: '21' },
      { a: '88', label: '타점', b: '79' },
    ],
  },
};

describe('headToHeadWidget — 구조 + 게이트', () => {
  it('위젯 식별자', () => {
    expect(HEAD_TO_HEAD_WIDGET_ID).toBe('head_to_head_widget');
  });

  it("root id='root' Column + children [title, header_row, statRow0..2]", () => {
    const root = HEAD_TO_HEAD_COMPONENTS.find((c) => c.id === 'root');
    expect(root?.id).toBe('root');
    expect(root?.component).toBe('Column');
    expect(root?.children).toEqual([
      'title',
      'header_row',
      'statRow0',
      'statRow1',
      'statRow2',
    ]);
  });

  it('각 statRow{n} Row children [s{n}_a, s{n}_label, s{n}_b]', () => {
    for (let n = 0; n < 3; n += 1) {
      const row = HEAD_TO_HEAD_COMPONENTS.find((c) => c.id === `statRow${n}`);
      expect(row?.component).toBe('Row');
      expect(row?.children).toEqual([`s${n}_a`, `s${n}_label`, `s${n}_b`]);
    }
  });

  it('기본 카탈로그 5종 컴포넌트만 사용', () => {
    for (const node of HEAD_TO_HEAD_COMPONENTS) {
      expect(BASIC_5).toContain(node.component as string);
      expect(BATDI_CATALOG_COMPONENT_NAMES).toContain(node.component as string);
    }
  });

  it('bindSchema 가 기대 경로 배열과 일치', () => {
    expect(HEAD_TO_HEAD_BIND_SCHEMA).toEqual([
      'h2h.playerA.name',
      'h2h.playerB.name',
      'h2h.rows.0.a',
      'h2h.rows.0.label',
      'h2h.rows.0.b',
      'h2h.rows.1.a',
      'h2h.rows.1.label',
      'h2h.rows.1.b',
      'h2h.rows.2.a',
      'h2h.rows.2.label',
      'h2h.rows.2.b',
    ]);
  });

  it('데이터 주입 시 valid + 노드/깊이 게이트 통과 (18노드, depth 3)', () => {
    const compiled = compileBindings(HEAD_TO_HEAD_COMPONENTS);
    const result = validateBatdiA2UI({
      components: compiled,
      data: DATA_MODEL,
      validateBindings: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(HEAD_TO_HEAD_COMPONENTS.length).toBe(18);
    expect(HEAD_TO_HEAD_COMPONENTS.length).toBeLessThanOrEqual(MAX_NODES);
    expect(
      result.errors.some(
        (e) => e.code === 'max_nodes_exceeded' || e.code === 'max_depth_exceeded',
      ),
    ).toBe(false);
    expect(MAX_DEPTH).toBe(4);
  });
});
