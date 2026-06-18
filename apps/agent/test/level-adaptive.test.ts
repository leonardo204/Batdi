/**
 * applyLevelAdaptation 단위테스트 (P3-W9 9.5)
 *
 * 지식 레벨 footnote 주입의 순수 함수 동작/불변성을 검증한다.
 *  - beginner/expert → adapted true, root.children 끝에 'level_note' + Text 노드 추가.
 *  - core / statType undefined → adapted false, 입력 원본 그대로(불변).
 */
import { describe, it, expect } from 'vitest';
import { applyLevelAdaptation } from '../src/templates/level-adaptive';

/** standings_compact 패턴 최소 트리(root Column + title + row0) */
function standingsLike(): Array<Record<string, unknown>> {
  return [
    { id: 'root', component: 'Column', children: ['title', 'row0'] },
    { id: 'title', component: 'Text', text: '팀 순위', variant: 'h3' },
    { id: 'row0', component: 'Text', text: '{{bind:"rows.0.line"}}' },
  ];
}

/** player_stat_compact 패턴 최소 트리 */
function playerLike(): Array<Record<string, unknown>> {
  return [
    { id: 'root', component: 'Column', children: ['title', 'row0'] },
    { id: 'title', component: 'Text', text: '선수 기록', variant: 'h3' },
    { id: 'row0', component: 'Text', text: '{{bind:"rows.0.line"}}' },
  ];
}

describe('applyLevelAdaptation — beginner/expert → footnote 주입', () => {
  it('standings + beginner → adapted true, level_note 노드 추가 + root.children 마지막이 level_note', () => {
    const res = applyLevelAdaptation(standingsLike(), {
      statType: 'standings',
      knowledgeLevel: 'beginner',
    });
    expect(res.adapted).toBe(true);

    const note = res.components.find((c) => c.id === 'level_note');
    expect(note).toBeDefined();
    expect(note).toMatchObject({ id: 'level_note', component: 'Text', variant: 'caption' });
    expect(String(note?.text)).toContain('승률');

    const root = res.components.find((c) => c.id === 'root');
    const children = root?.children as string[];
    expect(children[children.length - 1]).toBe('level_note');
  });

  it('player + expert → adapted true, level_note 텍스트가 expert 세이버 안내', () => {
    const res = applyLevelAdaptation(playerLike(), {
      statType: 'player',
      knowledgeLevel: 'expert',
    });
    expect(res.adapted).toBe(true);
    const note = res.components.find((c) => c.id === 'level_note');
    // 세이버 지표 안내(wRC+/WAR) — beginner 용어설명과 구분.
    expect(String(note?.text)).toMatch(/wRC\+|WAR|세이버/);
  });
});

describe('applyLevelAdaptation — core / undefined → 적용 없음(불변)', () => {
  it('standings + core → adapted false, components 가 입력과 동일(level_note 없음)', () => {
    const input = standingsLike();
    const res = applyLevelAdaptation(input, {
      statType: 'standings',
      knowledgeLevel: 'core',
    });
    expect(res.adapted).toBe(false);
    // 원본 배열을 그대로 돌려준다(동일 참조).
    expect(res.components).toBe(input);
    expect(res.components.find((c) => c.id === 'level_note')).toBeUndefined();
  });

  it('statType undefined → adapted false', () => {
    const res = applyLevelAdaptation(standingsLike(), {
      statType: undefined,
      knowledgeLevel: 'beginner',
    });
    expect(res.adapted).toBe(false);
    expect(res.components.find((c) => c.id === 'level_note')).toBeUndefined();
  });
});

describe('applyLevelAdaptation — 입력 원본 불변성', () => {
  it('적용(beginner) 시 입력 배열 length 변화 없음 + root.children 변화 없음(복제 확인)', () => {
    const input = standingsLike();
    const beforeLen = input.length;
    const rootBefore = input.find((c) => c.id === 'root');
    const childrenBefore = [...(rootBefore?.children as string[])];

    const res = applyLevelAdaptation(input, {
      statType: 'standings',
      knowledgeLevel: 'beginner',
    });

    // 입력 원본은 변형되지 않음.
    expect(input.length).toBe(beforeLen);
    expect(rootBefore?.children).toEqual(childrenBefore);
    expect(input.find((c) => c.id === 'level_note')).toBeUndefined();
    // 반환 배열은 노드 1개 추가됨.
    expect(res.components.length).toBe(beforeLen + 1);
  });

  it('미적용(core) 시 입력 배열 length 변화 없음', () => {
    const input = playerLike();
    const beforeLen = input.length;
    const res = applyLevelAdaptation(input, {
      statType: 'player',
      knowledgeLevel: 'core',
    });
    expect(input.length).toBe(beforeLen);
    expect(res.components.length).toBe(beforeLen);
  });
});
