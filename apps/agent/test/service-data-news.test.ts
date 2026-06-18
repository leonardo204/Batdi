/**
 * serviceData — news intent 분기 단위테스트 (P3-W7 7.5 ADR-048)
 *
 * intent='news' → fetchNewsData(teamId) 호출 → { newsData } 반환을 검증한다.
 * fetchNewsData 를 모킹해 teamId 전달·반환 매핑·null 폴백을 단언한다(meme 분기 평행).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchNewsDataMock = vi.fn();

vi.mock('../src/services/news-graph', () => ({
  fetchNewsData: (teamId?: string) => fetchNewsDataMock(teamId),
}));

import { serviceData } from '../src/nodes/service-data';
import type { CoreGraphState } from '../src/state';

function makeState(over: Partial<CoreGraphState> = {}): CoreGraphState {
  return {
    intent: 'news',
    teamId: 'hanwha',
    inputGuardrailResult: { pass: true },
    complexity: 'simple',
    userMessageNormalized: '뉴스보여줘',
    ...over,
  } as unknown as CoreGraphState;
}

describe('serviceData — news intent', () => {
  beforeEach(() => {
    fetchNewsDataMock.mockReset();
  });

  it('intent=news → fetchNewsData(teamId) 호출 + { newsData } 반환', async () => {
    const data = { rows: [{ line: 'A — src' }] };
    fetchNewsDataMock.mockResolvedValue(data);

    const update = await serviceData(makeState({ teamId: 'lotte' }));

    expect(fetchNewsDataMock).toHaveBeenCalledWith('lotte');
    expect(update).toEqual({ newsData: data });
  });

  it('fetchNewsData null(데이터 없음) → { newsData: null } 반환(best-effort)', async () => {
    fetchNewsDataMock.mockResolvedValue(null);
    const update = await serviceData(makeState());
    expect(update).toEqual({ newsData: null });
  });

  it('가드레일 차단(pass=false) → 조회 안 함({})', async () => {
    const update = await serviceData(
      makeState({ inputGuardrailResult: { pass: false } as never }),
    );
    expect(fetchNewsDataMock).not.toHaveBeenCalled();
    expect(update).toEqual({});
  });
});
