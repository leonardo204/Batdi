/**
 * registry — TEMPLATE_BY_INTENT.news 배선 단위테스트 (P3-W7 7.5 ADR-048)
 *
 *  - resolveTemplate('news') → news_compact 템플릿(templateId/components/bindSchema).
 *  - news_compact 컴파일 후 rows 주입 → validateBatdiA2UI valid + 게이트(maxNodes/maxDepth) 통과.
 *  - schedule/lineup 은 여전히 미배선(undefined) — news 한정 해제 확인(회귀 가드).
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

  it('schedule/lineup 은 여전히 미배선(undefined) — news 한정 해제', () => {
    expect(resolveTemplate('schedule')).toBeUndefined();
    expect(resolveTemplate('lineup')).toBeUndefined();
  });
});
