/**
 * standings_compact 템플릿 구조 + 게이트 통과 테스트 (stats intent)
 *
 *  - 컴포넌트 12개(root Column + title + 10줄), root.children = title + row0..row9.
 *  - compileBindings 로 rows.N.line → /rows/N/line(점 → 슬래시) 변환 확인.
 *  - validateBatdiA2UI(@batdi/a2ui-schema)로 data 주입 시 valid +
 *    maxNodes=30 / maxDepth=4 게이트 통과 단언(노드 12 < 30, 깊이 2 < 4).
 */
import { describe, it, expect } from 'vitest';
import { validateBatdiA2UI, MAX_NODES, MAX_DEPTH } from '@batdi/a2ui-schema';
import { compileBindings } from '../src/databind/compile';
import {
  STANDINGS_COMPACT_COMPONENTS,
  STANDINGS_COMPACT_BIND_SCHEMA,
  STANDINGS_COMPACT_TEMPLATE_ID,
} from '../src/templates/standings_compact';

/** 10팀 더미 순위 데이터(rows.N.line) */
const standingsData = {
  rows: Array.from({ length: 10 }, (_, n) => ({
    line: `${n + 1}  팀${n + 1}  ${40 - n}승${20 + n}패0무  ${(0.6 - n * 0.01).toFixed(3)}`,
  })),
};

describe('standings_compact — 구조', () => {
  it('템플릿 식별자', () => {
    expect(STANDINGS_COMPACT_TEMPLATE_ID).toBe('standings_compact');
  });

  it('컴포넌트 12개 (root + title + 10줄)', () => {
    expect(STANDINGS_COMPACT_COMPONENTS).toHaveLength(12);
  });

  it('root 는 Column, children 은 title + row0..row9 (11개)', () => {
    const root = STANDINGS_COMPACT_COMPONENTS.find((c) => c.id === 'root');
    expect(root?.component).toBe('Column');
    const children = root?.children as string[];
    expect(children).toHaveLength(11);
    expect(children[0]).toBe('title');
    expect(children.slice(1)).toEqual(
      Array.from({ length: 10 }, (_, n) => `row${n}`),
    );
  });

  it('row0..row9 는 Text + {{bind:"rows.N.line"}} authoring 표기', () => {
    for (let n = 0; n < 10; n += 1) {
      const node = STANDINGS_COMPACT_COMPONENTS.find((c) => c.id === `row${n}`);
      expect(node?.component).toBe('Text');
      expect(node?.text).toBe(`{{bind:"rows.${n}.line"}}`);
    }
  });

  it('bindSchema 는 rows.0.line .. rows.9.line', () => {
    expect(STANDINGS_COMPACT_BIND_SCHEMA).toEqual(
      Array.from({ length: 10 }, (_, n) => `rows.${n}.line`),
    );
  });
});

describe('standings_compact — compileBindings', () => {
  it('rows.N.line → { path: "/rows/N/line" } 로 컴파일(점 → 슬래시)', () => {
    const compiled = compileBindings(STANDINGS_COMPACT_COMPONENTS);
    for (let n = 0; n < 10; n += 1) {
      const node = compiled.find((c) => c.id === `row${n}`);
      expect(node?.text).toEqual({ path: `/rows/${n}/line` });
    }
    // 정적 타이틀은 그대로
    const title = compiled.find((c) => c.id === 'title');
    expect(title?.text).toBe('팀 순위');
  });
});

describe('standings_compact — 게이트 통과(validateBatdiA2UI)', () => {
  it('data(rows 10팀) 주입 시 valid:true, 에러 없음', () => {
    const compiled = compileBindings(STANDINGS_COMPACT_COMPONENTS);
    const result = validateBatdiA2UI({
      components: compiled,
      data: standingsData,
      validateBindings: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('노드수 12 < maxNodes(30) / 깊이 2 < maxDepth(4) — 게이트 통과', () => {
    // 노드 12개(root+title+10), 깊이 2(root=1, 자식=2).
    expect(STANDINGS_COMPACT_COMPONENTS.length).toBeLessThanOrEqual(MAX_NODES);
    expect(STANDINGS_COMPACT_COMPONENTS.length).toBe(12);
    // 깊이 게이트는 validateBatdiA2UI 가 통합 검사 — valid 면 max_depth/max_nodes 위반 없음.
    const compiled = compileBindings(STANDINGS_COMPACT_COMPONENTS);
    const result = validateBatdiA2UI({ components: compiled, data: standingsData });
    expect(
      result.errors.some(
        (e) => e.code === 'max_nodes_exceeded' || e.code === 'max_depth_exceeded',
      ),
    ).toBe(false);
    expect(MAX_DEPTH).toBe(4);
  });
});
