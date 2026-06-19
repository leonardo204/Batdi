/**
 * serviceData — h2h intent 분기 단위테스트 (ADR-057)
 *
 * intent='h2h' → fetchHeadToHead(teamId) 호출 → { headToHeadData } 반환을 검증한다.
 * fetchHeadToHead 를 모킹해 teamId 전달·반환 매핑·null 폴백을 단언한다(news 분기 평행).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchHeadToHeadMock = vi.fn();

vi.mock('../src/services/head-to-head-graph', () => ({
  fetchHeadToHead: (teamId?: string) => fetchHeadToHeadMock(teamId),
}));

import { serviceData } from '../src/nodes/service-data';
import type { CoreGraphState } from '../src/state';

function makeState(over: Partial<CoreGraphState> = {}): CoreGraphState {
  return {
    intent: 'h2h',
    teamId: 'lg',
    inputGuardrailResult: { pass: true },
    complexity: 'simple',
    userMessageNormalized: '상대전적어때',
    ...over,
  } as unknown as CoreGraphState;
}

describe('serviceData — h2h intent', () => {
  beforeEach(() => {
    fetchHeadToHeadMock.mockReset();
  });

  it('intent=h2h → fetchHeadToHead(teamId) 호출 + { headToHeadData } 반환', async () => {
    const data = { rows: [{ line: 'vs SSG 8승1패0무' }] };
    fetchHeadToHeadMock.mockResolvedValue(data);

    const update = await serviceData(makeState({ teamId: 'hanwha' }));

    expect(fetchHeadToHeadMock).toHaveBeenCalledWith('hanwha');
    expect(update).toEqual({ headToHeadData: data });
  });

  it('fetchHeadToHead null(데이터 없음) → { headToHeadData: null } 반환(best-effort)', async () => {
    fetchHeadToHeadMock.mockResolvedValue(null);
    const update = await serviceData(makeState());
    expect(update).toEqual({ headToHeadData: null });
  });

  it('가드레일 차단(pass=false) → 조회 안 함({})', async () => {
    const update = await serviceData(
      makeState({ inputGuardrailResult: { pass: false } as never }),
    );
    expect(fetchHeadToHeadMock).not.toHaveBeenCalled();
    expect(update).toEqual({});
  });
});
