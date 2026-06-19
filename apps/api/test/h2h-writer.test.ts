/**
 * h2h-writer.test.ts — H2HWriter 단위 테스트 (ADR-057).
 *
 * prisma.teamHeadToHead(findFirst/create/update) 를 모킹해:
 *  - 신규 쌍 → create(saved=1), 기존 쌍 → update(modified=1),
 *  - (season, teamId, opponentId) 자연키로 멱등,
 *  - opponentId null 보존,
 *  - best-effort(throw 흡수 없이 정상 upsert)
 * 를 검증한다. lineup-writer.test.ts 평행 패턴.
 */
import { describe, it, expect, vi } from 'vitest';
import { H2HWriter } from '../src/kbo/kbo-writer';
import type { TeamHeadToHeadRow } from '../src/kbo/kbo-parser';

function makeRow(over: Partial<TeamHeadToHeadRow> = {}): TeamHeadToHeadRow {
  return {
    season: 2026,
    teamId: 'lg',
    opponentId: 'kt',
    opponentName: 'KT',
    wins: 3,
    losses: 5,
    draws: 0,
    ...over,
  };
}

function makeWriter(existing: { id: number } | null) {
  const findFirst = vi.fn().mockResolvedValue(existing);
  const create = vi.fn().mockResolvedValue({ id: 1 });
  const update = vi.fn().mockResolvedValue({ id: 1 });
  const prisma = { teamHeadToHead: { findFirst, create, update } };
  const writer = new H2HWriter(prisma as never);
  return { writer, findFirst, create, update };
}

describe('H2HWriter.write', () => {
  it('신규 쌍 → create(saved=1), (season,teamId,opponentId) 조회 키', async () => {
    const { writer, findFirst, create } = makeWriter(null);
    const res = await writer.write([makeRow()]);

    expect(res).toEqual({ collected: 1, saved: 1, modified: 0 });
    expect(findFirst.mock.calls[0]![0].where).toEqual({
      season: 2026,
      teamId: 'lg',
      opponentId: 'kt',
    });
    expect(create.mock.calls[0]![0].data).toMatchObject({
      season: 2026,
      teamId: 'lg',
      opponentId: 'kt',
      opponentName: 'KT',
      wins: 3,
      losses: 5,
      draws: 0,
    });
  });

  it('기존 쌍 → update(modified=1), 변경 가능 필드만 갱신', async () => {
    const { writer, update } = makeWriter({ id: 42 });
    const res = await writer.write([makeRow({ wins: 4, losses: 4 })]);

    expect(res).toEqual({ collected: 1, saved: 0, modified: 1 });
    expect(update.mock.calls[0]![0].where).toEqual({ id: 42 });
    expect(update.mock.calls[0]![0].data).toEqual({
      opponentName: 'KT',
      wins: 4,
      losses: 4,
      draws: 0,
    });
  });

  it('미지원 상대 opponentId null 보존(표시명만)', async () => {
    const { writer, findFirst, create } = makeWriter(null);
    await writer.write([
      makeRow({ opponentId: null, opponentName: '미래구단' }),
    ]);
    expect(findFirst.mock.calls[0]![0].where.opponentId).toBeNull();
    expect(create.mock.calls[0]![0].data.opponentId).toBeNull();
    expect(create.mock.calls[0]![0].data.opponentName).toBe('미래구단');
  });

  it('여러 행 혼합(신규+기존) 카운트 합산', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null) // 1행 신규
      .mockResolvedValueOnce({ id: 9 }); // 2행 기존
    const create = vi.fn().mockResolvedValue({ id: 1 });
    const update = vi.fn().mockResolvedValue({ id: 9 });
    const writer = new H2HWriter({
      teamHeadToHead: { findFirst, create, update },
    } as never);

    const res = await writer.write([
      makeRow({ opponentId: 'kt' }),
      makeRow({ opponentId: 'samsung', opponentName: '삼성' }),
    ]);
    expect(res).toEqual({ collected: 2, saved: 1, modified: 1 });
  });
});
