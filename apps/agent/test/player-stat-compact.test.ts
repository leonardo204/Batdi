/**
 * player_stat_compact 템플릿 구조 + 게이트 통과 테스트 (stats intent / statType=player)
 *
 *  - 컴포넌트 8개(root Column + title + 6줄), root.children = title + row0..row5.
 *  - compileBindings 로 rows.N.line → /rows/N/line(점 → 슬래시) 변환 확인.
 *  - validateBatdiA2UI(@batdi/a2ui-schema)로 data 주입 시 valid +
 *    maxNodes=30 / maxDepth=4 게이트 통과 단언(노드 8 < 30, 깊이 2 < 4).
 */
import { describe, it, expect } from 'vitest';
import { validateBatdiA2UI, MAX_NODES, MAX_DEPTH } from '@batdi/a2ui-schema';
import { compileBindings } from '../src/databind/compile';
import {
  PLAYER_STAT_COMPACT_COMPONENTS,
  PLAYER_STAT_COMPACT_BIND_SCHEMA,
  PLAYER_STAT_COMPACT_TEMPLATE_ID,
} from '../src/templates/player_stat_compact';

/** 6명 더미 리더보드 데이터(rows.N.line) */
const playerData = {
  rows: Array.from({ length: 6 }, (_, n) => ({
    line: `${n + 1}  선수${n + 1}  ${(0.36 - n * 0.01).toFixed(3)}  ${10 - n}홈런  ${49 - n}타점`,
  })),
};

describe('player_stat_compact — 구조', () => {
  it('템플릿 식별자', () => {
    expect(PLAYER_STAT_COMPACT_TEMPLATE_ID).toBe('player_stat_compact');
  });

  it('컴포넌트 8개 (root + title + 6줄)', () => {
    expect(PLAYER_STAT_COMPACT_COMPONENTS).toHaveLength(8);
  });

  it('root 는 Column, children 은 title + row0..row5 (7개)', () => {
    const root = PLAYER_STAT_COMPACT_COMPONENTS.find((c) => c.id === 'root');
    expect(root?.component).toBe('Column');
    const children = root?.children as string[];
    expect(children).toHaveLength(7);
    expect(children[0]).toBe('title');
    expect(children.slice(1)).toEqual(
      Array.from({ length: 6 }, (_, n) => `row${n}`),
    );
  });

  it('title 은 "선수 기록"', () => {
    const title = PLAYER_STAT_COMPACT_COMPONENTS.find((c) => c.id === 'title');
    expect(title?.text).toBe('선수 기록');
  });

  it('row0..row5 는 Text + {{bind:"rows.N.line"}} authoring 표기', () => {
    for (let n = 0; n < 6; n += 1) {
      const node = PLAYER_STAT_COMPACT_COMPONENTS.find((c) => c.id === `row${n}`);
      expect(node?.component).toBe('Text');
      expect(node?.text).toBe(`{{bind:"rows.${n}.line"}}`);
    }
  });

  it('bindSchema 는 rows.0.line .. rows.5.line', () => {
    expect(PLAYER_STAT_COMPACT_BIND_SCHEMA).toEqual(
      Array.from({ length: 6 }, (_, n) => `rows.${n}.line`),
    );
  });
});

describe('player_stat_compact — compileBindings', () => {
  it('rows.N.line → { path: "/rows/N/line" } 로 컴파일(점 → 슬래시)', () => {
    const compiled = compileBindings(PLAYER_STAT_COMPACT_COMPONENTS);
    for (let n = 0; n < 6; n += 1) {
      const node = compiled.find((c) => c.id === `row${n}`);
      expect(node?.text).toEqual({ path: `/rows/${n}/line` });
    }
    const title = compiled.find((c) => c.id === 'title');
    expect(title?.text).toBe('선수 기록');
  });
});

describe('player_stat_compact — 게이트 통과(validateBatdiA2UI)', () => {
  it('data(rows 6명) 주입 시 valid:true, 에러 없음', () => {
    const compiled = compileBindings(PLAYER_STAT_COMPACT_COMPONENTS);
    const result = validateBatdiA2UI({
      components: compiled,
      data: playerData,
      validateBindings: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('노드수 8 < maxNodes(30) / 깊이 2 < maxDepth(4) — 게이트 통과', () => {
    expect(PLAYER_STAT_COMPACT_COMPONENTS.length).toBeLessThanOrEqual(MAX_NODES);
    expect(PLAYER_STAT_COMPACT_COMPONENTS.length).toBe(8);
    const compiled = compileBindings(PLAYER_STAT_COMPACT_COMPONENTS);
    const result = validateBatdiA2UI({ components: compiled, data: playerData });
    expect(
      result.errors.some(
        (e) => e.code === 'max_nodes_exceeded' || e.code === 'max_depth_exceeded',
      ),
    ).toBe(false);
    expect(MAX_DEPTH).toBe(4);
  });
});
