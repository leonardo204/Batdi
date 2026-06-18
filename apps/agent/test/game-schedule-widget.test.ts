/**
 * A2UI 위젯 gameScheduleWidget(P3-W8 8.3, ADR-046) 구조/게이트 테스트
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
  GAME_SCHEDULE_COMPONENTS,
  GAME_SCHEDULE_BIND_SCHEMA,
  GAME_SCHEDULE_WIDGET_ID,
} from '../src/templates/game_schedule_widget';

const BASIC_5 = ['Text', 'Row', 'Column', 'Button', 'TextField'];

const DATA_MODEL: Record<string, unknown> = {
  game: {
    date: '2026-06-18',
    home: '롯데',
    away: '한화',
    venue: '사직',
    time: '18:30',
  },
};

describe('gameScheduleWidget — 구조 + 게이트', () => {
  it('위젯 식별자', () => {
    expect(GAME_SCHEDULE_WIDGET_ID).toBe('game_schedule_widget');
  });

  it("root id='root' Column + children [title, date_text, matchup_row, venue_text, time_text]", () => {
    const root = GAME_SCHEDULE_COMPONENTS.find((c) => c.id === 'root');
    expect(root?.id).toBe('root');
    expect(root?.component).toBe('Column');
    expect(root?.children).toEqual([
      'title',
      'date_text',
      'matchup_row',
      'venue_text',
      'time_text',
    ]);
  });

  it('matchup_row Row children [home_name, vs_label, away_name]', () => {
    const row = GAME_SCHEDULE_COMPONENTS.find((c) => c.id === 'matchup_row');
    expect(row?.component).toBe('Row');
    expect(row?.children).toEqual(['home_name', 'vs_label', 'away_name']);
  });

  it('기본 카탈로그 5종 컴포넌트만 사용', () => {
    for (const node of GAME_SCHEDULE_COMPONENTS) {
      expect(BASIC_5).toContain(node.component as string);
      expect(BATDI_CATALOG_COMPONENT_NAMES).toContain(node.component as string);
    }
  });

  it('bindSchema 가 기대 경로 배열과 일치', () => {
    expect(GAME_SCHEDULE_BIND_SCHEMA).toEqual([
      'game.date',
      'game.home',
      'game.away',
      'game.venue',
      'game.time',
    ]);
  });

  it('데이터 주입 시 valid + 노드/깊이 게이트 통과', () => {
    const compiled = compileBindings(GAME_SCHEDULE_COMPONENTS);
    const result = validateBatdiA2UI({
      components: compiled,
      data: DATA_MODEL,
      validateBindings: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(GAME_SCHEDULE_COMPONENTS.length).toBeLessThanOrEqual(MAX_NODES);
    expect(
      result.errors.some(
        (e) => e.code === 'max_nodes_exceeded' || e.code === 'max_depth_exceeded',
      ),
    ).toBe(false);
    expect(MAX_DEPTH).toBe(4);
  });
});
