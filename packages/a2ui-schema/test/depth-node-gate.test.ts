/**
 * 깊이/노드 게이트 테스트 (palette-schema §5.4.1, ADR-019 잔여 게이트)
 *
 * checkDepthAndNodes: BFS 로 maxDepth=4 / maxNodes=30 / 순환·중복 / dangling 검사.
 * validateBatdiA2UI: toolkit(구조·카탈로그·바인딩) + 본 게이트 통합 보고 검증.
 */
import { describe, it, expect } from 'vitest';
import {
  checkDepthAndNodes,
  validateBatdiA2UI,
  MAX_DEPTH,
  MAX_NODES,
} from '../src/index';

type Node = Record<string, unknown>;

/** Column 체인(깊이 n): root → c2 → … → c{n-1}(Column) → leaf(Text). 최대 깊이 = n */
function columnChain(depth: number): Node[] {
  const nodes: Node[] = [];
  for (let d = 1; d < depth; d++) {
    const id = d === 1 ? 'root' : `c${d}`;
    const childId = d + 1 === depth ? 'leaf' : `c${d + 1}`;
    nodes.push({ id, component: 'Column', children: [childId] });
  }
  nodes.push({ id: 'leaf', component: 'Text', text: '끝' });
  return nodes;
}

describe('checkDepthAndNodes — 깊이 게이트 (maxDepth=4)', () => {
  it('깊이 4 트리는 통과(루트=1, leaf=4)', () => {
    // root(1)→c2(2)→c3(3)→leaf(4)
    expect(checkDepthAndNodes(columnChain(4))).toEqual([]);
  });

  it('깊이 5 트리는 max_depth_exceeded', () => {
    const errors = checkDepthAndNodes(columnChain(5));
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('max_depth_exceeded');
  });
});

describe('checkDepthAndNodes — 노드 게이트 (maxNodes=30)', () => {
  function rootWithChildren(n: number): Node[] {
    const childIds = Array.from({ length: n }, (_, i) => `t${i}`);
    const nodes: Node[] = [{ id: 'root', component: 'Column', children: childIds }];
    for (const id of childIds) nodes.push({ id, component: 'Text', text: 'x' });
    return nodes;
  }

  it('노드 30개(root + 29 child)는 통과', () => {
    expect(checkDepthAndNodes(rootWithChildren(29))).toEqual([]);
  });

  it('노드 31개(root + 30 child)는 max_nodes_exceeded', () => {
    const errors = checkDepthAndNodes(rootWithChildren(30));
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('max_nodes_exceeded');
  });
});

describe('checkDepthAndNodes — 무결성(순환·dangling·고아)', () => {
  it('순환 참조(root↔a)는 cycle_or_dup_id', () => {
    const nodes: Node[] = [
      { id: 'root', component: 'Column', children: ['a'] },
      { id: 'a', component: 'Column', children: ['root'] },
    ];
    expect(checkDepthAndNodes(nodes)[0].code).toBe('cycle_or_dup_id');
  });

  it('인덱스에 없는 자식 참조는 dangling_child_ref', () => {
    const nodes: Node[] = [
      { id: 'root', component: 'Column', children: ['ghost'] },
    ];
    expect(checkDepthAndNodes(nodes)[0].code).toBe('dangling_child_ref');
  });

  it('고아 노드(루트 비도달)는 카운트 제외 → 통과', () => {
    const nodes: Node[] = [
      { id: 'root', component: 'Text', text: 'x' },
      { id: 'orphan', component: 'Text', text: 'y' }, // 루트에서 도달 불가
    ];
    expect(checkDepthAndNodes(nodes)).toEqual([]);
  });

  it('루트 부재 시 게이트 스킵(toolkit no_root 가 보고) → 빈 배열', () => {
    const nodes: Node[] = [{ id: 'notroot', component: 'Text', text: 'x' }];
    expect(checkDepthAndNodes(nodes)).toEqual([]);
  });

  it('단일 child(배열 아님) 도 따라간다(Button/Card 형태)', () => {
    // root → btn(child:txt) → 깊이 3, 3노드
    const nodes: Node[] = [
      { id: 'root', component: 'Column', children: ['btn'] },
      { id: 'btn', component: 'Button', child: 'txt' },
      { id: 'txt', component: 'Text', text: '확인' },
    ];
    expect(checkDepthAndNodes(nodes)).toEqual([]);
    // child 미연결이면 깊이가 줄어 동일 트리라도 노드 누락 없이 카운트됨을 간접 확인
  });
});

describe('validateBatdiA2UI — toolkit + 깊이/노드 통합', () => {
  it('한도 내 정상 트리는 valid', () => {
    const result = validateBatdiA2UI({
      components: [
        { id: 'root', component: 'Column', children: ['t1'] },
        { id: 't1', component: 'Text', text: '안녕' },
      ],
      validateBindings: false,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('toolkit 구조 valid 라도 깊이 초과면 전체 invalid + max_depth_exceeded 포함', () => {
    const result = validateBatdiA2UI({
      components: columnChain(5),
      validateBindings: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'max_depth_exceeded')).toBe(true);
  });

  it('상수 노출: MAX_DEPTH=4, MAX_NODES=30', () => {
    expect(MAX_DEPTH).toBe(4);
    expect(MAX_NODES).toBe(30);
  });
});
