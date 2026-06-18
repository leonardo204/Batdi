/**
 * A2UI 위젯 playerChipWidget(P3-W8 8.3, ADR-046) 구조/게이트 테스트
 *
 *  - root id='root' Row + 기대 children, 기본 5종 컴포넌트만, bindSchema 일치.
 *  - compileBindings 후 validateBatdiA2UI(데이터 주입) valid + maxNodes/maxDepth 게이트.
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
  PLAYER_CHIP_COMPONENTS,
  PLAYER_CHIP_BIND_SCHEMA,
  PLAYER_CHIP_WIDGET_ID,
} from '../src/templates/player_chip_widget';

const BASIC_5 = ['Text', 'Row', 'Column', 'Button', 'TextField'];

const DATA_MODEL: Record<string, unknown> = {
  player: { name: '나성범', team: '기아', position: 'RF', number: '47' },
};

describe('playerChipWidget — 구조 + 게이트', () => {
  it('위젯 식별자', () => {
    expect(PLAYER_CHIP_WIDGET_ID).toBe('player_chip_widget');
  });

  it("root id='root' Row + children [name, position, number, team]", () => {
    const root = PLAYER_CHIP_COMPONENTS.find((c) => c.id === 'root');
    expect(root?.id).toBe('root');
    expect(root?.component).toBe('Row');
    expect(root?.children).toEqual(['name', 'position', 'number', 'team']);
  });

  it('기본 카탈로그 5종 컴포넌트만 사용', () => {
    for (const node of PLAYER_CHIP_COMPONENTS) {
      expect(BASIC_5).toContain(node.component as string);
      expect(BATDI_CATALOG_COMPONENT_NAMES).toContain(node.component as string);
    }
  });

  it('bindSchema 가 기대 경로 배열과 일치', () => {
    expect(PLAYER_CHIP_BIND_SCHEMA).toEqual([
      'player.name',
      'player.team',
      'player.position',
      'player.number',
    ]);
  });

  it('데이터 주입 시 valid + 노드/깊이 게이트 통과', () => {
    const compiled = compileBindings(PLAYER_CHIP_COMPONENTS);
    const result = validateBatdiA2UI({
      components: compiled,
      data: DATA_MODEL,
      validateBindings: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(PLAYER_CHIP_COMPONENTS.length).toBeLessThanOrEqual(MAX_NODES);
    expect(
      result.errors.some(
        (e) => e.code === 'max_nodes_exceeded' || e.code === 'max_depth_exceeded',
      ),
    ).toBe(false);
    expect(MAX_DEPTH).toBe(4);
  });
});
