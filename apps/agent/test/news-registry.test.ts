/**
 * registry — TEMPLATE_BY_INTENT.news 배선 단위테스트 (P3-W7 7.5 ADR-048)
 *
 *  - resolveTemplate('news') → news_compact 템플릿(templateId/components/bindSchema).
 *  - news_compact 컴파일 후 rows 주입 → validateBatdiA2UI valid + 게이트(maxNodes/maxDepth) 통과.
 *  - ADR-052: schedule/lineup 도 배선됨(서브그래프 도입) — schedule_compact/lineup_compact.
 */
import { describe, it, expect } from 'vitest';
import {
  validateBatdiA2UI,
  MAX_NODES,
  MAX_DEPTH,
} from '@batdi/a2ui-schema';
import { resolveTemplate } from '../src/templates/registry';
import { compileBindings } from '../src/databind/compile';
import { buildA2UIOps } from '../src/databind/emit';
import { NEWS_COMPACT_TEMPLATE_ID } from '../src/templates/news_compact';
import { SCHEDULE_COMPACT_TEMPLATE_ID } from '../src/templates/schedule_compact';
import { LINEUP_COMPACT_TEMPLATE_ID } from '../src/templates/lineup_compact';

describe('registry — news 배선', () => {
  it('resolveTemplate("news") → news_compact 템플릿', () => {
    const tpl = resolveTemplate('news');
    expect(tpl).toBeDefined();
    expect(tpl?.templateId).toBe(NEWS_COMPACT_TEMPLATE_ID);
    expect(tpl?.bindSchema).toContain('rows.0.line');
    expect(tpl?.bindSchema).toContain('rows.4.line');
  });

  it('news_compact + rows 주입 → A2UI valid + 게이트 통과', () => {
    const tpl = resolveTemplate('news');
    const compiled = compileBindings(tpl!.components);
    const rows = Array.from({ length: 5 }, (_, n) => ({ line: `뉴스${n} — 출처` }));
    const result = buildA2UIOps(compiled, { rows }, 'KBO 뉴스');
    expect(result.valid).toBe(true);
    expect(result.usedFallback).toBe(false);

    // 게이트: 데이터 주입 후 valid(노드 7/깊이 2 < 한도).
    const v = validateBatdiA2UI({ components: compiled, data: { rows } });
    expect(v.valid).toBe(true);
    // 노드 수·깊이 한도 상수가 존재(가드).
    expect(MAX_NODES).toBeGreaterThanOrEqual(7);
    expect(MAX_DEPTH).toBeGreaterThanOrEqual(2);
  });

  it('ADR-052: schedule → schedule_compact 배선 + 카드 valid', () => {
    const tpl = resolveTemplate('schedule');
    expect(tpl?.templateId).toBe(SCHEDULE_COMPACT_TEMPLATE_ID);
    expect(tpl?.bindSchema).toContain('date');
    expect(tpl?.bindSchema).toContain('rows.4.line');

    const compiled = compileBindings(tpl!.components);
    const rows = Array.from({ length: 5 }, (_, n) => ({ line: `경기${n}` }));
    const result = buildA2UIOps(
      compiled,
      { date: '6월 18일 기준', rows },
      '경기 일정',
    );
    expect(result.valid).toBe(true);
    expect(result.usedFallback).toBe(false);
  });

  it('ADR-052: lineup → lineup_compact 배선 + 카드 valid', () => {
    const tpl = resolveTemplate('lineup');
    expect(tpl?.templateId).toBe(LINEUP_COMPACT_TEMPLATE_ID);
    expect(tpl?.bindSchema).toContain('team');
    expect(tpl?.bindSchema).toContain('rows.8.line');

    const compiled = compileBindings(tpl!.components);
    const rows = Array.from({ length: 9 }, (_, n) => ({ line: `${n + 1}번 선수` }));
    const result = buildA2UIOps(compiled, { team: '두산', rows }, '라인업');
    expect(result.valid).toBe(true);
    expect(result.usedFallback).toBe(false);
  });
});
