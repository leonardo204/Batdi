/**
 * serviceData — schedule/lineup intent 분기 단위테스트 (ADR-052)
 *
 * intent='schedule' → fetchScheduleData(teamId) → { scheduleData }.
 * intent='lineup'   → fetchLineupData(teamId)   → { lineupData }.
 * fetch* 를 모킹해 teamId 전달·반환 매핑·null 폴백·가드레일 차단을 단언한다(news 분기 평행).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchScheduleDataMock = vi.fn();
const fetchLineupDataMock = vi.fn();

vi.mock('../src/services/schedule-graph', () => ({
  fetchScheduleData: (teamId?: string) => fetchScheduleDataMock(teamId),
}));
vi.mock('../src/services/lineup-graph', () => ({
  fetchLineupData: (teamId?: string) => fetchLineupDataMock(teamId),
}));

import { serviceData } from '../src/nodes/service-data';
import type { CoreGraphState } from '../src/state';

function makeState(over: Partial<CoreGraphState> = {}): CoreGraphState {
  return {
    intent: 'schedule',
    teamId: 'hanwha',
    inputGuardrailResult: { pass: true },
    complexity: 'simple',
    userMessageNormalized: '일정',
    ...over,
  } as unknown as CoreGraphState;
}

describe('serviceData — schedule intent', () => {
  beforeEach(() => {
    fetchScheduleDataMock.mockReset();
    fetchLineupDataMock.mockReset();
  });

  it('intent=schedule → fetchScheduleData(teamId) 호출 + { scheduleData } 반환', async () => {
    const data = { date: '6월 18일 기준', rows: [{ line: 'A' }] };
    fetchScheduleDataMock.mockResolvedValue(data);

    const update = await serviceData(makeState({ teamId: 'lotte' }));

    expect(fetchScheduleDataMock).toHaveBeenCalledWith('lotte');
    expect(update).toEqual({ scheduleData: data });
  });

  it('fetchScheduleData null → { scheduleData: null }(best-effort)', async () => {
    fetchScheduleDataMock.mockResolvedValue(null);
    const update = await serviceData(makeState());
    expect(update).toEqual({ scheduleData: null });
  });

  it('가드레일 차단(pass=false) → 조회 안 함({})', async () => {
    const update = await serviceData(
      makeState({ inputGuardrailResult: { pass: false } as never }),
    );
    expect(fetchScheduleDataMock).not.toHaveBeenCalled();
    expect(update).toEqual({});
  });
});

describe('serviceData — lineup intent', () => {
  beforeEach(() => {
    fetchScheduleDataMock.mockReset();
    fetchLineupDataMock.mockReset();
  });

  it('intent=lineup → fetchLineupData(teamId) 호출 + { lineupData } 반환', async () => {
    fetchLineupDataMock.mockResolvedValue(null);

    const update = await serviceData(
      makeState({ intent: 'lineup', teamId: 'doosan' }),
    );

    expect(fetchLineupDataMock).toHaveBeenCalledWith('doosan');
    expect(update).toEqual({ lineupData: null });
  });

  it('lineup 실데이터 있으면 그대로 반환(향후 크롤러)', async () => {
    const data = { team: '두산', rows: [{ line: '1번 (중) 홍길동' }] };
    fetchLineupDataMock.mockResolvedValue(data);
    const update = await serviceData(makeState({ intent: 'lineup' }));
    expect(update).toEqual({ lineupData: data });
  });
});
