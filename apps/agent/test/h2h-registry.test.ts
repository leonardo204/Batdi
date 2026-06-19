/**
 * registry — TEMPLATE_BY_INTENT.h2h 배선 단위테스트 (ADR-057)
 *
 *  - resolveTemplate('h2h') → h2h_compact 템플릿(templateId/components/bindSchema).
 *  - h2h_compact 컴파일 후 rows 주입 → validateBatdiA2UI valid + 게이트(maxNodes/maxDepth) 통과.
 *  - TEMPLATE_CATALOG 에 h2h_compact(intent 'h2h') 포함.
 */
import { describe, it, expect } from 'vitest';
import { validateBatdiA2UI } from '@batdi/a2ui-schema';
import { resolveTemplate, TEMPLATE_CATALOG } from '../src/templates/registry';
import { compileBindings } from '../src/databind/compile';
import { buildA2UIOps } from '../src/databind/emit';
import { HEAD_TO_HEAD_COMPACT_TEMPLATE_ID } from '../src/templates/h2h_compact';

describe('registry — h2h 배선', () => {
  it('resolveTemplate("h2h") → h2h_compact 템플릿', () => {
    const tpl = resolveTemplate('h2h');
    expect(tpl).toBeDefined();
    expect(tpl?.templateId).toBe(HEAD_TO_HEAD_COMPACT_TEMPLATE_ID);
    expect(tpl?.bindSchema).toContain('rows.0.line');
    expect(tpl?.bindSchema).toContain('rows.8.line');
  });

  it('h2h_compact + rows 주입 → A2UI valid + 게이트 통과', () => {
    const tpl = resolveTemplate('h2h');
    const compiled = compileBindings(tpl!.components);
    const rows = Array.from({ length: 9 }, (_, n) => ({
      line: `vs 상대${n} ${n}승${n}패0무`,
    }));
    const result = buildA2UIOps(compiled, { rows }, '상대전적');
    expect(result.valid).toBe(true);
    expect(result.usedFallback).toBe(false);

    const v = validateBatdiA2UI({ components: compiled, data: { rows } });
    expect(v.valid).toBe(true);
  });

  it('TEMPLATE_CATALOG 에 h2h_compact(intent "h2h") 포함', () => {
    const row = TEMPLATE_CATALOG.find(
      (r) => r.templateId === HEAD_TO_HEAD_COMPACT_TEMPLATE_ID,
    );
    expect(row).toBeDefined();
    expect(row?.intent).toBe('h2h');
  });
});
