import { describe, it, expect } from 'vitest';
import { validateBatdiA2UI } from '@batdi/a2ui-schema';
import { buildA2UIOps, buildFallbackComponents } from '../src/databind/emit';
import { compileBindings, getStubScoreData } from '../src/databind/compile';
import { SCORE_COMPACT_COMPONENTS } from '../src/templates/score_compact';

// score_compact 는 {{bind}} 수치 슬롯 + {{llm.reaction}} 슬롯(/reaction)을 가진다.
// 따라서 valid 검증용 데이터 모델엔 stub 수치 + reaction 을 함께 넣는다 (P2-W6).
const stubData = {
  ...(getStubScoreData() as unknown as Record<string, unknown>),
  reaction: '오 좋은데유~ 화이팅이여!',
};

describe('validateBatdiA2UI — 정상 score ops', () => {
  it('컴파일된 score_compact + stub 데이터 → valid:true', () => {
    const compiled = compileBindings(SCORE_COMPACT_COMPONENTS);
    const result = validateBatdiA2UI({
      components: compiled,
      data: stubData,
      validateBindings: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('validateBatdiA2UI — 깨진 ops', () => {
  it('unknown_component (카탈로그 외 컴포넌트) → valid:false', () => {
    const result = validateBatdiA2UI({
      components: [{ id: 'root', component: 'ScoreCard', text: 'x' }],
      data: {},
      validateBindings: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'unknown_component')).toBe(true);
  });

  it('no_root (root id 없음) → valid:false', () => {
    const result = validateBatdiA2UI({
      components: [{ id: 'title', component: 'Text', text: '스코어' }],
      data: {},
      validateBindings: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'no_root')).toBe(true);
  });

  it('missing_required_prop (Text에 text 누락) → valid:false', () => {
    const result = validateBatdiA2UI({
      components: [{ id: 'root', component: 'Text' }],
      data: {},
      validateBindings: true,
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'missing_required_prop'),
    ).toBe(true);
  });

  it('unresolved_binding (data에 없는 경로) → valid:false', () => {
    const result = validateBatdiA2UI({
      components: [
        { id: 'root', component: 'Text', text: { path: '/nope/missing' } },
      ],
      data: {},
      validateBindings: true,
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'unresolved_binding'),
    ).toBe(true);
  });
});

describe('buildA2UIOps', () => {
  it('valid 입력 → 3 ops(createSurface/updateComponents/updateDataModel), 폴백 없음', () => {
    const compiled = compileBindings(SCORE_COMPACT_COMPONENTS);
    const r = buildA2UIOps(compiled, stubData, '롯데 5 : 두산 3 (7회말)');
    expect(r.valid).toBe(true);
    expect(r.usedFallback).toBe(false);
    expect(r.ops).toHaveLength(3);
    expect(r.ops[0]).toHaveProperty('createSurface');
    expect(r.ops[1]).toHaveProperty('updateComponents');
    expect(r.ops[2]).toHaveProperty('updateDataModel');
  });

  it('invalid 입력 → LLM 재호출 없이 최소 Text 카드 폴백', () => {
    const broken = [{ id: 'root', component: 'ScoreCard' }];
    const r = buildA2UIOps(broken, {}, '롯데 5 : 두산 3 (7회말)');
    expect(r.valid).toBe(false);
    expect(r.usedFallback).toBe(true);
    // 폴백 ops: createSurface + updateComponents(단일 Text root)
    expect(r.ops).toHaveLength(2);
    const updateOp = r.ops[1] as {
      updateComponents: { components: Array<Record<string, unknown>> };
    };
    expect(updateOp.updateComponents.components).toEqual(
      buildFallbackComponents('롯데 5 : 두산 3 (7회말)'),
    );
    // 폴백 컴포넌트 자체는 valid 해야 함
    const fb = validateBatdiA2UI({
      components: buildFallbackComponents('롯데 5 : 두산 3 (7회말)'),
      data: {},
    });
    expect(fb.valid).toBe(true);
  });
});
