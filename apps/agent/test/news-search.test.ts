/**
 * NewsSearch 서비스 단위테스트 (ADR-058 — Gemini grounding 질의추출 + 파싱)
 *
 *  - extractNewsQuery: 토픽 추출(노이즈 제거)·팀 폴백·queryKey 안정성(결정론).
 *  - parseNewsFromResponse(순수): 마크다운 불릿 줄 → NewsItem[] + groundingChunks url 매칭.
 *  - searchNews: ChatGoogleGenerativeAI invoke 를 모킹 → groundingMetadata 파싱→NewsItem,
 *    키 없음→null, 빈/파싱 0건→null, invoke throw→null(best-effort).
 *
 * 라이브 grounding 호출은 하지 않는다(probe-grounding.ts 로만 실측 — 결정론 유지).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const { mockInvoke, mockBindTools } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockBindTools: vi.fn(),
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class {
    invoke = mockInvoke;
    bindTools = (...args: unknown[]) => {
      mockBindTools(...args);
      return this; // bound 모델도 같은 invoke 사용.
    };
  },
}));

import {
  extractNewsQuery,
  parseNewsFromResponse,
  searchNews,
  toQueryKey,
} from '../src/services/news-search';

const ORIGINAL_KEY = process.env.GOOGLE_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.GOOGLE_API_KEY;
  } else {
    process.env.GOOGLE_API_KEY = ORIGINAL_KEY;
  }
  mockInvoke.mockReset();
  mockBindTools.mockReset();
});

describe('extractNewsQuery (토픽 추출 + 팀 폴백 + queryKey)', () => {
  it('토픽 남으면 토픽 사용("오타니 뉴스 알려줘" → "오타니")', () => {
    expect(extractNewsQuery('오타니 뉴스 알려줘', 'hanwha').query).toBe('오타니');
  });

  it('"한화 소식" → 토픽 "한화"', () => {
    expect(extractNewsQuery('한화 소식', 'hanwha').query).toBe('한화');
  });

  it('토픽이 비면 팀 한글 풀네임 폴백("뉴스 보여줘"+hanwha → "한화 이글스")', () => {
    expect(extractNewsQuery('뉴스 보여줘', 'hanwha').query).toBe('한화 이글스');
  });

  it('토픽 비고 팀도 없으면 "KBO" 폴백', () => {
    expect(extractNewsQuery('뉴스', undefined).query).toBe('KBO');
    expect(extractNewsQuery('', null).query).toBe('KBO');
  });

  it('팀 코드 매핑(롯데/기아/두산 풀네임)', () => {
    expect(extractNewsQuery('뉴스', 'lotte').query).toBe('롯데 자이언츠');
    expect(extractNewsQuery('소식', 'kia').query).toBe('KIA 타이거즈');
    expect(extractNewsQuery('기사', 'doosan').query).toBe('두산 베어스');
  });

  it('queryKey 는 동일 의미 질의에 안정적(대소문자/공백 무시)', () => {
    const a = extractNewsQuery('오타니 뉴스', 'hanwha').queryKey;
    const b = extractNewsQuery('오타니   뉴스', 'hanwha').queryKey;
    expect(a).toBe(b);
    expect(a).toBe(toQueryKey('오타니'));
    expect(a.length).toBeLessThanOrEqual(64);
  });

  it('다른 토픽이면 다른 queryKey', () => {
    const a = extractNewsQuery('오타니 뉴스', 'hanwha').queryKey;
    const b = extractNewsQuery('류현진 뉴스', 'hanwha').queryKey;
    expect(a).not.toBe(b);
  });
});

describe('parseNewsFromResponse (순수)', () => {
  const text = [
    '다음은 한화 이글스 관련 최신 뉴스 5건입니다:',
    '*   한화 5연속 역전패의 이유 — 이투데이',
    '*   차갑게 식은 한화 페문강노허 — 뉴스핌',
    '*   6연패 한화 타선 울상 — 뉴시스',
  ].join('\n');

  it('불릿 줄 → "제목 — 출처" 분해 + 도입문 스킵', () => {
    const items = parseNewsFromResponse(text);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      title: '한화 5연속 역전패의 이유',
      source: '이투데이',
    });
    expect(items[1].source).toBe('뉴스핌');
  });

  it('groundingChunks[i].web.uri 를 같은 인덱스 url 로 매칭', () => {
    const grounding = {
      groundingChunks: [
        { web: { uri: 'https://r/1', title: 'etoday.co.kr' } },
        { web: { uri: 'https://r/2', title: 'newspim.com' } },
      ],
    };
    const items = parseNewsFromResponse(text, grounding);
    expect(items[0].url).toBe('https://r/1');
    expect(items[1].url).toBe('https://r/2');
    expect(items[2].url).toBeUndefined(); // chunk 부족분은 url 없음
  });

  it('구분자 없는 줄은 source="뉴스" 폴백(짧은 항목)', () => {
    const items = parseNewsFromResponse('*   한화 승리');
    expect(items[0]).toMatchObject({ title: '한화 승리', source: '뉴스' });
  });

  it('최대 5건으로 절단', () => {
    const many = Array.from({ length: 8 }, (_, n) => `*   제목${n} — 출처`).join('\n');
    expect(parseNewsFromResponse(many)).toHaveLength(5);
  });

  it('빈 텍스트 → 빈 배열', () => {
    expect(parseNewsFromResponse('')).toEqual([]);
  });
});

describe('searchNews (LLM invoke 모킹)', () => {
  it('GOOGLE_API_KEY 없음 → null(invoke 미호출)', async () => {
    delete process.env.GOOGLE_API_KEY;
    expect(await searchNews('한화 이글스')).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('grounding 응답 파싱 → NewsItem[] + googleSearch 바인딩', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({
      content: ['*   한화 역전승 — 뉴시스', '*   한화 호투 — 엑스포츠'].join('\n'),
      response_metadata: {
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://r/1' } },
            { web: { uri: 'https://r/2' } },
          ],
        },
      },
    });
    const items = await searchNews('한화 이글스');
    expect(items).toHaveLength(2);
    expect(items![0]).toMatchObject({
      title: '한화 역전승',
      source: '뉴시스',
      url: 'https://r/1',
    });
    // googleSearch 툴로 바인딩됨.
    expect(mockBindTools).toHaveBeenCalledWith([{ googleSearch: {} }]);
  });

  it('빈 응답(파싱 0건) → null', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockResolvedValue({ content: '', response_metadata: {} });
    expect(await searchNews('한화 이글스')).toBeNull();
  });

  it('invoke throw → null(best-effort)', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    mockInvoke.mockRejectedValue(new Error('quota'));
    expect(await searchNews('한화 이글스')).toBeNull();
  });

  it('빈 query → null(invoke 미호출)', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    expect(await searchNews('   ')).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
