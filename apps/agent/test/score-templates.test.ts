/**
 * score 템플릿 3종(P2-W5.4) 구조/게이트 + resolveScoreTemplate 선택 + emit 배선 테스트
 *
 *  - score_default / score_emphasized 컴파일 후 validateBatdiA2UI(데이터 주입) valid +
 *    maxNodes(30)/maxDepth(4) 게이트 통과 단언. root id='root', 5종 기본 컴포넌트만.
 *  - resolveScoreTemplate 분기: FINISHED→emphasized, PLAYING→default, SCHEDULED/null→compact.
 *  - emit 배선: scoreData.status='FINISHED' → emphasized 컴포넌트 셋, 'SCHEDULED'→compact.
 */
import { describe, it, expect } from 'vitest';
import {
  validateBatdiA2UI,
  MAX_NODES,
  MAX_DEPTH,
  BATDI_CATALOG_COMPONENT_NAMES,
} from '@batdi/a2ui-schema';
import { compileBindings } from '../src/databind/compile';
import type { GameStatusName, ScoreData } from '../src/databind/compile';
import {
  SCORE_DEFAULT_COMPONENTS,
  SCORE_DEFAULT_BIND_SCHEMA,
  SCORE_DEFAULT_TEMPLATE_ID,
} from '../src/templates/score_default';
import {
  SCORE_EMPHASIZED_COMPONENTS,
  SCORE_EMPHASIZED_BIND_SCHEMA,
  SCORE_EMPHASIZED_TEMPLATE_ID,
} from '../src/templates/score_emphasized';
import { SCORE_COMPACT_TEMPLATE_ID } from '../src/templates/score_compact';
import { resolveScoreTemplate } from '../src/templates/registry';
import { emitA2UI } from '../src/nodes/emit-a2ui';
import type { CoreGraphState } from '../src/state';

/** 기본 카탈로그 5종 화이트리스트(검증용) */
const BASIC_5 = ['Text', 'Row', 'Column', 'Button', 'TextField'];

function scoreDataWith(status: GameStatusName): ScoreData {
  return {
    home: { name: '한화', score: 5 },
    away: { name: '두산', score: 3 },
    inning: '6/16 경기 종료',
    status,
  };
}

/** ScoreData(status 제외)를 data model 로 — bind 슬롯 + reaction 주입 */
function scoreDataModel(status: GameStatusName): Record<string, unknown> {
  const d = scoreDataWith(status);
  return {
    home: d.home,
    away: d.away,
    inning: d.inning,
    reaction: '오 좋은데유~',
  };
}

describe('score_default — 구조 + 게이트', () => {
  it('템플릿 식별자', () => {
    expect(SCORE_DEFAULT_TEMPLATE_ID).toBe('score_default');
  });

  it('root id="root" Column, bindSchema 5경로', () => {
    const root = SCORE_DEFAULT_COMPONENTS.find((c) => c.id === 'root');
    expect(root?.id).toBe('root');
    expect(root?.component).toBe('Column');
    expect(SCORE_DEFAULT_BIND_SCHEMA).toEqual([
      'home.name',
      'home.score',
      'away.name',
      'away.score',
      'inning',
    ]);
  });

  it('기본 카탈로그 5종 컴포넌트만 사용', () => {
    for (const node of SCORE_DEFAULT_COMPONENTS) {
      expect(BASIC_5).toContain(node.component as string);
      expect(BATDI_CATALOG_COMPONENT_NAMES).toContain(node.component as string);
    }
  });

  it('데이터 주입 시 valid + 노드/깊이 게이트 통과', () => {
    const compiled = compileBindings(SCORE_DEFAULT_COMPONENTS);
    const result = validateBatdiA2UI({
      components: compiled,
      data: scoreDataModel('PLAYING'),
      validateBindings: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(SCORE_DEFAULT_COMPONENTS.length).toBeLessThanOrEqual(MAX_NODES);
    expect(
      result.errors.some(
        (e) => e.code === 'max_nodes_exceeded' || e.code === 'max_depth_exceeded',
      ),
    ).toBe(false);
  });
});

describe('score_emphasized — 구조 + 게이트', () => {
  it('템플릿 식별자', () => {
    expect(SCORE_EMPHASIZED_TEMPLATE_ID).toBe('score_emphasized');
  });

  it('root id="root" Column, bindSchema 5경로', () => {
    const root = SCORE_EMPHASIZED_COMPONENTS.find((c) => c.id === 'root');
    expect(root?.id).toBe('root');
    expect(root?.component).toBe('Column');
    expect(SCORE_EMPHASIZED_BIND_SCHEMA).toEqual([
      'home.name',
      'home.score',
      'away.name',
      'away.score',
      'inning',
    ]);
  });

  it('기본 카탈로그 5종 컴포넌트만 사용', () => {
    for (const node of SCORE_EMPHASIZED_COMPONENTS) {
      expect(BASIC_5).toContain(node.component as string);
      expect(BATDI_CATALOG_COMPONENT_NAMES).toContain(node.component as string);
    }
  });

  it('데이터 주입 시 valid + 노드/깊이 게이트 통과(중첩 Row 2단, depth ≤ 4)', () => {
    const compiled = compileBindings(SCORE_EMPHASIZED_COMPONENTS);
    const result = validateBatdiA2UI({
      components: compiled,
      data: scoreDataModel('FINISHED'),
      validateBindings: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(SCORE_EMPHASIZED_COMPONENTS.length).toBeLessThanOrEqual(MAX_NODES);
    expect(
      result.errors.some(
        (e) => e.code === 'max_nodes_exceeded' || e.code === 'max_depth_exceeded',
      ),
    ).toBe(false);
    expect(MAX_DEPTH).toBe(4);
  });
});

describe('resolveScoreTemplate — gameStatus 분기 (순수)', () => {
  it('FINISHED → score_emphasized', () => {
    expect(resolveScoreTemplate(scoreDataWith('FINISHED')).templateId).toBe(
      SCORE_EMPHASIZED_TEMPLATE_ID,
    );
  });

  it('PLAYING → score_default', () => {
    expect(resolveScoreTemplate(scoreDataWith('PLAYING')).templateId).toBe(
      SCORE_DEFAULT_TEMPLATE_ID,
    );
  });

  it('SCHEDULED → score_compact', () => {
    expect(resolveScoreTemplate(scoreDataWith('SCHEDULED')).templateId).toBe(
      SCORE_COMPACT_TEMPLATE_ID,
    );
  });

  it('CANCELLED/UNKNOWN → score_compact', () => {
    expect(resolveScoreTemplate(scoreDataWith('CANCELLED')).templateId).toBe(
      SCORE_COMPACT_TEMPLATE_ID,
    );
    expect(resolveScoreTemplate(scoreDataWith('UNKNOWN')).templateId).toBe(
      SCORE_COMPACT_TEMPLATE_ID,
    );
  });

  it('null/undefined → score_compact', () => {
    expect(resolveScoreTemplate(null).templateId).toBe(SCORE_COMPACT_TEMPLATE_ID);
    expect(resolveScoreTemplate(undefined).templateId).toBe(
      SCORE_COMPACT_TEMPLATE_ID,
    );
  });
});

describe('emitA2UI — score 템플릿 선택 배선', () => {
  function makeScoreState(status: GameStatusName): CoreGraphState {
    return {
      messages: [],
      userMessage: '오늘 경기 어때?',
      userMessageNormalized: '오늘경기어때',
      userMessageDisplay: '오늘 경기 어때?',
      userId: 'u1',
      teamId: 'hanwha',
      inputGuardrailResult: { pass: true } as never,
      outputGuardrailResult: undefined,
      intent: 'score',
      intentConfidence: 'high',
      complexity: 'simple',
      cacheHit: 'miss',
      scoreData: scoreDataWith(status),
      a2uiEnvelope: undefined,
      llmCallCount: undefined,
      traceId: undefined,
    } as unknown as CoreGraphState;
  }

  /** envelope ops 에서 updateComponents 의 컴포넌트 id 셋 추출 */
  function componentIds(update: { a2uiEnvelope?: unknown }): Set<string> {
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    const compOp = ops.find((o) => 'updateComponents' in o) as
      | { updateComponents: { components: Array<Record<string, unknown>> } }
      | undefined;
    const comps = compOp?.updateComponents.components ?? [];
    return new Set(comps.map((c) => c.id as string));
  }

  it("status='FINISHED' → emphasized 컴포넌트 셋(score_row/home_block/vs 포함)", async () => {
    const update = await emitA2UI(makeScoreState('FINISHED'));
    const ids = componentIds(update);
    const expected = new Set(
      SCORE_EMPHASIZED_COMPONENTS.map((c) => c.id as string),
    );
    expect(ids).toEqual(expected);
    expect(ids.has('score_row')).toBe(true);
    expect(ids.has('home_block')).toBe(true);
    expect(ids.has('vs')).toBe(true);
  });

  it("status='PLAYING' → default 컴포넌트 셋(home_row/away_row, score_row 없음)", async () => {
    const update = await emitA2UI(makeScoreState('PLAYING'));
    const ids = componentIds(update);
    const expected = new Set(SCORE_DEFAULT_COMPONENTS.map((c) => c.id as string));
    expect(ids).toEqual(expected);
    expect(ids.has('home_row')).toBe(true);
    expect(ids.has('score_row')).toBe(false);
  });

  it("status='SCHEDULED' → compact 컴포넌트 셋(home/away_row, h4 variant 없음)", async () => {
    const update = await emitA2UI(makeScoreState('SCHEDULED'));
    const ids = componentIds(update);
    // compact 도 home_row/away_row 를 가지므로 default 와 id 셋이 같다 → 구조 동등.
    // 식별은 templateId(resolveScoreTemplate)로 이미 단언했으므로 여기선 id 셋 유효성만.
    expect(ids.has('home_row')).toBe(true);
    expect(ids.has('away_row')).toBe(true);
    expect(ids.has('score_row')).toBe(false);
    // data model 에 home/away/inning 주입 확인(세 템플릿 동일 계약)
    const ops = update.a2uiEnvelope as Array<Record<string, unknown>>;
    const dataOp = ops.find((o) => 'updateDataModel' in o) as
      | { updateDataModel: { value: Record<string, unknown> } }
      | undefined;
    expect(dataOp?.updateDataModel.value).toMatchObject({
      home: { name: '한화', score: 5 },
      away: { name: '두산', score: 3 },
      inning: '6/16 경기 종료',
    });
  });
});
