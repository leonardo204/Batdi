/**
 * TEMPLATE_CATALOG / resolveStatsTemplate(P3-W8 8.4, ADR-047) 테스트
 *
 *  - 카탈로그 16종(≥15) 구조: templateId 유니크, intent 비어있지 않음.
 *  - 각 row: compileBindings → validateBatdiA2UI(샘플 데이터모델) valid + 게이트 통과.
 *  - intent 별 그룹 존재(score/stats 등).
 *  - resolveStatsTemplate variant additive: emphasized → _emphasized, 미지정/'compact' → _compact(회귀).
 */
import { describe, it, expect } from 'vitest';
import {
  validateBatdiA2UI,
  MAX_NODES,
  BATDI_CATALOG_COMPONENT_NAMES,
} from '@batdi/a2ui-schema';
import { compileBindings, REACTION_DATA_PATH } from '../src/databind/compile';
import { TEMPLATE_CATALOG, resolveStatsTemplate } from '../src/templates/registry';
import { STANDINGS_COMPACT_TEMPLATE_ID } from '../src/templates/standings_compact';
import { STANDINGS_EMPHASIZED_TEMPLATE_ID } from '../src/templates/standings_emphasized';
import { PLAYER_STAT_COMPACT_TEMPLATE_ID } from '../src/templates/player_stat_compact';
import { PLAYER_STAT_EMPHASIZED_TEMPLATE_ID } from '../src/templates/player_stat_emphasized';

const BASIC_5 = ['Text', 'Row', 'Column', 'Button', 'TextField'];

/**
 * bindSchema 점경로들을 채운 샘플 데이터모델 생성(점경로 → 중첩 객체, 모두 문자열 'X').
 * + 컴파일된 트리에 /reaction 슬롯이 있으면 reaction 도 채운다(LLM 감정 리액션 슬롯).
 */
function dataModelFor(
  bindSchema: ReadonlyArray<string>,
  hasReaction: boolean,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const path of bindSchema) {
    const parts = path.split('.');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i] as string;
      if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = {};
      cur = cur[key] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1] as string] = 'X';
  }
  if (hasReaction) root['reaction'] = '좋은 경기였어!';
  return root;
}

/** 컴파일된 트리에 /reaction 슬롯 path 가 존재하는지(score 류 템플릿) */
function treeHasReaction(compiled: Array<Record<string, unknown>>): boolean {
  return compiled.some((node) =>
    Object.values(node).some(
      (v) =>
        typeof v === 'object' &&
        v !== null &&
        (v as { path?: string }).path === REACTION_DATA_PATH,
    ),
  );
}

describe('TEMPLATE_CATALOG — 카탈로그 구조(ADR-047)', () => {
  it('16종(≥15) 등록', () => {
    expect(TEMPLATE_CATALOG.length).toBeGreaterThanOrEqual(15);
    expect(TEMPLATE_CATALOG.length).toBe(16);
  });

  it('templateId 유니크', () => {
    const ids = TEMPLATE_CATALOG.map((r) => r.templateId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 row intent 비어있지 않음', () => {
    for (const row of TEMPLATE_CATALOG) {
      expect(typeof row.intent).toBe('string');
      expect(row.intent.trim()).not.toBe('');
    }
  });

  it('intent 별 그룹 존재(score≥3, stats≥4)', () => {
    const byIntent = (intent: string) =>
      TEMPLATE_CATALOG.filter((r) => r.intent === intent).length;
    expect(byIntent('score')).toBeGreaterThanOrEqual(3);
    expect(byIntent('stats')).toBeGreaterThanOrEqual(4);
    expect(byIntent('schedule')).toBeGreaterThanOrEqual(1);
    expect(byIntent('news')).toBeGreaterThanOrEqual(1);
    expect(byIntent('lineup')).toBeGreaterThanOrEqual(1);
    expect(byIntent('meme')).toBeGreaterThanOrEqual(1);
    expect(byIntent('chat')).toBeGreaterThanOrEqual(1);
  });

  it.each(TEMPLATE_CATALOG.map((r) => [r.templateId, r] as const))(
    '%s — 컴파일+검증 valid + 게이트 + 기본 5종',
    (_id, row) => {
      const rootNode = row.componentTree.find((c) => c.id === 'root');
      expect(rootNode?.id).toBe('root');
      for (const node of row.componentTree) {
        expect(BASIC_5).toContain(node.component as string);
        expect(BATDI_CATALOG_COMPONENT_NAMES).toContain(node.component as string);
      }
      const compiled = compileBindings(row.componentTree);
      const data = dataModelFor(row.bindSchema, treeHasReaction(compiled));
      const result = validateBatdiA2UI({
        components: compiled,
        data,
        validateBindings: true,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(row.componentTree.length).toBeLessThanOrEqual(MAX_NODES);
    },
  );
});

describe('resolveStatsTemplate — variant additive(회귀 0)', () => {
  it('미지정 → standings_compact(기존 동작 불변)', () => {
    expect(resolveStatsTemplate('standings').templateId).toBe(
      STANDINGS_COMPACT_TEMPLATE_ID,
    );
    expect(resolveStatsTemplate(undefined).templateId).toBe(
      STANDINGS_COMPACT_TEMPLATE_ID,
    );
  });

  it("'compact' → standings_compact", () => {
    expect(resolveStatsTemplate('standings', 'compact').templateId).toBe(
      STANDINGS_COMPACT_TEMPLATE_ID,
    );
  });

  it("'emphasized' → standings_emphasized", () => {
    expect(resolveStatsTemplate('standings', 'emphasized').templateId).toBe(
      STANDINGS_EMPHASIZED_TEMPLATE_ID,
    );
  });

  it("player + 미지정/'compact' → player_stat_compact", () => {
    expect(resolveStatsTemplate('player').templateId).toBe(
      PLAYER_STAT_COMPACT_TEMPLATE_ID,
    );
    expect(resolveStatsTemplate('player', 'compact').templateId).toBe(
      PLAYER_STAT_COMPACT_TEMPLATE_ID,
    );
  });

  it("player + 'emphasized' → player_stat_emphasized", () => {
    expect(resolveStatsTemplate('player', 'emphasized').templateId).toBe(
      PLAYER_STAT_EMPHASIZED_TEMPLATE_ID,
    );
  });
});
