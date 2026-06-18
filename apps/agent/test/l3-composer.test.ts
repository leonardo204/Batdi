/**
 * L3 UIComposer 서비스 테스트 (P3-W9 9.1)
 *
 * composeL3: composite 질의에 LLM 이 A2UI spec 을 동적 생성(검증은 호출부 게이트가 수행).
 *  - 키 없음 → null(폴백 신호, LLM 미호출)
 *  - 데이터 없음 → null(LLM 미호출)
 *  - LLM valid JSON 생성 → { components, data }
 *  - 코드펜스/설명 텍스트가 섞여도 첫 JSON 객체 관대 파싱
 *  - 파싱 불가/빈 components/throw → null
 *
 * LLM 호출은 @langchain/google-genai 를 **class 모킹**(semantic-guardrail.test.ts 패턴)으로
 * 결정론적으로 검증한다(실 호출 금지). CJS↔ESM interop 에서 `new` 가능하도록 class 로 모킹.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  composeL3,
  collectAvailableData,
  parseComposeResponse,
} from '../src/services/l3-composer';
import type { CoreGraphState } from '../src/state';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class {
    invoke = mockInvoke;
  },
}));

/** score + standings 실데이터가 있는 composite state(최소) */
function makeCompositeState(): CoreGraphState {
  return {
    messages: [],
    userMessage: '스코어랑 순위 같이 알려줘',
    userMessageNormalized: '스코어랑순위같이알려줘',
    complexity: 'composite',
    intent: 'score',
    matchedIntents: ['score', 'stats'],
    scoreData: {
      home: { name: '롯데', score: 5 },
      away: { name: '두산', score: 3 },
      inning: '6/16 경기 종료',
      status: 'FINISHED',
    },
    standingsData: { rows: [{ line: '1  LG  41승24패0무  0.631' }] },
  } as unknown as CoreGraphState;
}

describe('collectAvailableData', () => {
  it('존재하는 데이터(score/standings)만 수집한다', () => {
    const data = collectAvailableData(makeCompositeState());
    expect(data.score).toBeDefined();
    expect(data.standings).toBeDefined();
    expect(data.playerStats).toBeUndefined();
  });

  it('데이터 없으면 빈 객체', () => {
    const data = collectAvailableData({
      messages: [],
    } as unknown as CoreGraphState);
    expect(data).toEqual({});
  });
});

describe('parseComposeResponse', () => {
  it('순수 JSON 객체 파싱', () => {
    const r = parseComposeResponse(
      '{"components":[{"id":"root","component":"Text","text":"안녕"}],"data":{}}',
    );
    expect(r).not.toBeNull();
    expect(r?.components).toHaveLength(1);
  });

  it('코드펜스 + 앞뒤 설명 텍스트 관대 파싱', () => {
    const r = parseComposeResponse(
      '여기 결과입니다:\n```json\n{"components":[{"id":"root","component":"Text","text":"x"}],"data":{}}\n```\n끝',
    );
    expect(r).not.toBeNull();
    expect(r?.components[0]?.id).toBe('root');
  });

  it('파싱 불가 / 빈 문자열 / 빈 components → null', () => {
    expect(parseComposeResponse('그냥 텍스트뿐')).toBeNull();
    expect(parseComposeResponse('')).toBeNull();
    expect(
      parseComposeResponse('{"components":[],"data":{}}'),
    ).toBeNull();
  });
});

describe('composeL3', () => {
  const prevKey = process.env.GOOGLE_API_KEY;
  beforeEach(() => {
    mockInvoke.mockReset();
  });
  afterEach(() => {
    if (prevKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = prevKey;
  });

  it('키 없음 → null, LLM 미호출', async () => {
    delete process.env.GOOGLE_API_KEY;
    const out = await composeL3(makeCompositeState());
    expect(out).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('데이터 없음 → null, LLM 미호출', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    const out = await composeL3({
      messages: [],
      complexity: 'composite',
    } as unknown as CoreGraphState);
    expect(out).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('LLM valid JSON 생성 → { components, data }', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({
      content: JSON.stringify({
        components: [
          { id: 'root', component: 'Column', children: ['t1'] },
          { id: 't1', component: 'Text', text: { path: '/score/home/name' } },
        ],
        data: { score: { home: { name: '롯데' } } },
      }),
    });
    const out = await composeL3(makeCompositeState());
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(out).not.toBeNull();
    expect(out?.components).toHaveLength(2);
    expect(out?.data.score).toBeDefined();
  });

  it('코드펜스로 감싼 JSON 도 파싱', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({
      content:
        '```json\n{"components":[{"id":"root","component":"Text","text":"x"}],"data":{}}\n```',
    });
    const out = await composeL3(makeCompositeState());
    expect(out?.components[0]?.id).toBe('root');
  });

  it('파싱 불가 응답 → null', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '음 잘 모르겠어요' });
    const out = await composeL3(makeCompositeState());
    expect(out).toBeNull();
  });

  it('LLM throw → null(폴백, throw 전파 안 함)', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockRejectedValue(new Error('network'));
    const out = await composeL3(makeCompositeState());
    expect(out).toBeNull();
  });
});
