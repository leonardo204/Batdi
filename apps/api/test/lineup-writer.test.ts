/**
 * lineup-writer.test.ts — LineupWriter 단위 테스트 (ADR-056).
 *
 * prisma.gameLineup(findUnique/upsert) 를 모킹해 upsert(by gameKey) 멱등·gameDate Date 변환·
 * created/modified 카운트·teamId null 보존·best-effort 흡수를 검증한다.
 */
import { describe, it, expect, vi } from 'vitest';
import { LineupWriter } from '../src/kbo/kbo-writer';
import type { GameLineupRow } from '../src/kbo/kbo-parser';

function makeRow(over: Partial<GameLineupRow> = {}): GameLineupRow {
  return {
    gameKey: '20260618KTOB0',
    gameDate: '2026-06-18',
    homeTeamId: 'doosan',
    awayTeamId: 'kt',
    homeTeamName: '두산',
    awayTeamName: 'KT',
    homeStarter: '최민석',
    awayStarter: '소형준',
    stadium: '잠실',
    gameTime: '18:30',
    status: '경기예정',
    ...over,
  };
}

function makeWriter(existing: { gameKey: string } | null) {
  const findUnique = vi.fn().mockResolvedValue(existing);
  const upsert = vi.fn().mockResolvedValue({ gameKey: '20260618KTOB0' });
  const prisma = { gameLineup: { findUnique, upsert } };
  const writer = new LineupWriter(prisma as never);
  return { writer, findUnique, upsert };
}

describe('LineupWriter.write', () => {
  it('신규 행 → create(saved=1), gameDate Date 변환·선발투수 주입', async () => {
    const { writer, upsert } = makeWriter(null);
    const res = await writer.write([makeRow()]);

    expect(res).toEqual({ collected: 1, saved: 1, modified: 0 });
    const arg = upsert.mock.calls[0]![0];
    expect(arg.where).toEqual({ gameKey: '20260618KTOB0' });
    expect(arg.create.gameDate).toBeInstanceOf(Date);
    expect(arg.create.homeStarter).toBe('최민석');
    expect(arg.create.awayStarter).toBe('소형준');
    expect(arg.create.homeTeamId).toBe('doosan');
  });

  it('기존 행 → update(modified=1)', async () => {
    const { writer } = makeWriter({ gameKey: '20260618KTOB0' });
    const res = await writer.write([makeRow()]);
    expect(res).toEqual({ collected: 1, saved: 0, modified: 1 });
  });

  it('미지원 팀 teamId null 보존(표시명만)', async () => {
    const { writer, upsert } = makeWriter(null);
    await writer.write([
      makeRow({ homeTeamId: null, homeTeamName: '키움', awayTeamId: null, awayTeamName: '삼성' }),
    ]);
    const arg = upsert.mock.calls[0]![0];
    expect(arg.create.homeTeamId).toBeNull();
    expect(arg.create.awayTeamId).toBeNull();
    expect(arg.create.homeTeamName).toBe('키움');
  });

  it('선발 미발표(null) 저장 허용(throw 안 함)', async () => {
    const { writer, upsert } = makeWriter(null);
    await writer.write([makeRow({ homeStarter: null, awayStarter: null })]);
    const arg = upsert.mock.calls[0]![0];
    expect(arg.create.homeStarter).toBeNull();
    expect(arg.create.awayStarter).toBeNull();
  });
});
