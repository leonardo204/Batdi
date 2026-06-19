/**
 * NewsSearch 서비스 (ADR-058 — Gemini Google Search grounding 실시간 뉴스)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-058, §3.5,
 *       CLAUDE.md "팩트(수치)는 절대 LLM 이 생성 금지 — 검색 결과 기반만".
 *
 * 책임:
 *  - extractNewsQuery: 사용자 메시지에서 "뉴스/소식/기사/알려줘/검색" 등 노이즈를 제거해
 *    검색 토픽을 뽑는다. 비면 팀 한글명("한화 이글스")으로 폴백. normalize → queryKey(해시).
 *  - searchNews: ChatGoogleGenerativeAI(gemini-2.5-flash) + bindTools([{googleSearch:{}}]) 로
 *    실시간 검색해 응답 content(제목 — 출처 줄) + groundingMetadata(출처 URL/title)를
 *    파싱해 NewsItem[] 로 반환한다. best-effort — 키 없음/빈/파싱 실패 → null(throw 금지).
 *
 * ⚠️ grounding 응답은 비결정이라 L0 Envelope 캐시 불가 → news-graph 의 cache_news(queryKey
 *    TTL)로 대체한다(ADR-058).
 *
 * 라이브 실측(probe-grounding.ts):
 *  - 바인딩: `{ googleSearch: {} }` (gemini-2.5-flash, paid tier).
 *  - content: 마크다운 불릿 줄 `*   {제목} — {출처}` 5건.
 *  - response_metadata.groundingMetadata.groundingChunks[].web = { uri, title(도메인) }.
 *  - thinkingBudget 512 + maxOutputTokens 2048 에서 5건 완전 생성(0 이면 reasoning 토큰
 *    소진으로 1건만 나옴).
 */
import { createHash } from 'node:crypto';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseMessage } from '@langchain/core/messages';
import { getLangfuseHandler } from '../utils/langfuse';
import { TEAM_DISPLAY_NAME } from './score-graph';

/** grounding 검색으로 추출한 뉴스 1건(파싱 결과). */
export interface NewsItem {
  /** 헤드라인(제목). */
  title: string;
  /** 출처(언론사명 또는 도메인). 미상이면 '뉴스'. */
  source: string;
  /** 원문/grounding redirect URL(있으면). */
  url?: string;
  /** 요약(현재 grounding 은 한 줄 제목만 줘서 title 과 동일하게 채울 수 있음). */
  summary?: string;
}

/**
 * 팀 코드 → 검색용 정식 팀명(한글). TEAM_DISPLAY_NAME("한화")보다 검색 적합하도록 풀네임.
 * 미지/빈 코드는 폴백에서 'KBO' 로 수렴(extractNewsQuery 참조).
 */
const TEAM_SEARCH_NAME: Record<string, string> = {
  lotte: '롯데 자이언츠',
  doosan: '두산 베어스',
  kia: 'KIA 타이거즈',
  hanwha: '한화 이글스',
  samsung: '삼성 라이온즈',
  lg: 'LG 트윈스',
  heroes: '키움 히어로즈',
  nc: 'NC 다이노스',
  kt: 'KT 위즈',
  ssg: 'SSG 랜더스',
};

/**
 * 질의에서 제거할 뉴스 요청 노이즈 토큰(정규식). 토픽만 남긴다.
 * 예) "오타니 뉴스 알려줘" → "오타니", "한화 소식" → "한화".
 */
const NEWS_NOISE_RE =
  /(최신\s*)?(뉴스|소식|기사|속보|근황)|알려\s*줘|알려줘|보여\s*줘|보여줘|검색해?\s*줘?|검색|찾아\s*줘?|찾아줘|궁금해|어때\??|뭐\s*있어\??|있어\??|해?\s*줘|관련/g;

/**
 * 팀 코드 → 검색용 팀명(풀네임 우선, 없으면 TEAM_DISPLAY_NAME, 그것도 없으면 'KBO').
 */
function teamSearchName(teamId?: string | null): string {
  if (teamId === null || teamId === undefined || teamId.trim() === '') {
    return 'KBO';
  }
  const code = teamId.trim();
  return TEAM_SEARCH_NAME[code] ?? TEAM_DISPLAY_NAME[code] ?? 'KBO';
}

/** 공백 정규화(연속 공백 1개, 앞뒤 trim). */
function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * 검색 질의 텍스트를 정규화해 64자 이내의 안정적 queryKey(해시)로 만든다.
 * 동일 의미 질의가 같은 키를 갖도록 소문자화 + 공백 정규화 후 sha256 hex(앞 32자).
 */
export function toQueryKey(query: string): string {
  const norm = normalizeSpaces(query).toLowerCase();
  return createHash('sha256').update(norm).digest('hex').slice(0, 32);
}

/** extractNewsQuery 결과: 검색에 쓸 자연어 질의 + 캐시용 queryKey. */
export interface NewsQuery {
  /** 검색 LLM 에 전달할 자연어 토픽(예: "한화 이글스", "오타니"). */
  query: string;
  /** cache_news 조회/저장용 해시 키. */
  queryKey: string;
}

/**
 * 사용자 메시지에서 뉴스 검색 토픽을 추출한다(LLM 미사용 — 결정론).
 *
 *  - 뉴스 요청 노이즈("뉴스/소식/기사/알려줘/보여줘/검색")를 제거한 나머지가 토픽.
 *  - 남은 토픽이 비면 팀 한글명으로 폴백("한화 이글스"). 팀도 없으면 "KBO".
 *  - 결과 query 를 normalize 해 queryKey(해시) 산출.
 *
 * 예) "한화 뉴스" → "한화 이글스"(팀 폴백 X, "한화"는 토픽으로 남음 → 그대로 사용),
 *     실제로는 "한화" 가 남으면 그걸 토픽으로 쓴다(팀 폴백은 토픽이 완전히 빈 경우만).
 *     "오타니 뉴스 알려줘" → "오타니". "뉴스 보여줘"(토픽 없음) → 팀명 폴백.
 *
 * @param userMessage 원문 사용자 메시지(undefined/빈 → 팀 폴백)
 * @param teamId      팀 코드(토픽 비었을 때 폴백명 산출)
 */
export function extractNewsQuery(
  userMessage: string | undefined | null,
  teamId?: string | null,
): NewsQuery {
  const raw = (userMessage ?? '').trim();
  // 노이즈 제거 후 남은 토픽.
  const topic = normalizeSpaces(raw.replace(NEWS_NOISE_RE, ' '));

  // 토픽이 비었으면 팀명 폴백. 아니면 토픽 그대로 사용.
  const query = topic !== '' ? topic : teamSearchName(teamId);
  return { query, queryKey: toQueryKey(query) };
}

/** grounding 검색 LLM 의 maxOutputTokens(5건 + thinking 여유). */
const SEARCH_MAX_OUTPUT_TOKENS = 2048;
/** grounding thinking 예산(0 이면 reasoning 토큰 소진으로 1건만 나옴 — 실측). */
const SEARCH_THINKING_BUDGET = 512;
/** 파싱 상한(news_compact 5슬롯). */
const MAX_NEWS_ITEMS = 5;

/** BaseMessage.content(string | parts) → 평문. */
function contentToText(content: BaseMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/** groundingChunks[].web = { uri, title } 의 느슨한 타입(방어적 파싱용). */
interface GroundingChunkWeb {
  uri?: string;
  title?: string;
}
interface GroundingMetadataLoose {
  groundingChunks?: Array<{ web?: GroundingChunkWeb }>;
}

/**
 * grounding 응답 텍스트(마크다운 불릿 줄)와 groundingChunks 를 NewsItem[] 로 파싱한다.
 *
 *  - content 의 각 줄에서 `*`, `-`, `•`, 번호 등 불릿 마커를 떼고 "{제목} — {출처}" 분해.
 *  - " — "(em-dash) 또는 " - "(hyphen) 기준 마지막 구분자로 source 분리. 없으면 source='뉴스'.
 *  - groundingChunks[i].web.uri 를 같은 인덱스 NewsItem.url 로 매칭(있는 만큼).
 *  - 의미 있는 줄(헤드라인 후보)만 채택. 최대 5건.
 *
 * 순수 함수 — 테스트에서 직접 호출 가능.
 */
export function parseNewsFromResponse(
  text: string,
  grounding?: GroundingMetadataLoose,
): NewsItem[] {
  const chunks = grounding?.groundingChunks ?? [];
  const items: NewsItem[] = [];

  // 불릿/번호 마커 정규식(원문에서 항목 줄 여부 판정용).
  const bulletRe = /^\s*([*\-•]\s+|\d+[.)]\s+)/;

  const lines = text.split('\n');
  for (const rawLine of lines) {
    if (items.length >= MAX_NEWS_ITEMS) break;
    const hadBullet = bulletRe.test(rawLine);
    // 불릿/번호 마커 제거 후 내용.
    const line = rawLine.replace(bulletRe, '').trim();
    if (line === '') continue;

    // 항목 줄 판정: 원문에 불릿이 있었거나, "제목 — 출처" 구분자가 있는 줄만 채택한다.
    // 도입문("다음은 ... 뉴스 5건입니다.")처럼 불릿도 구분자도 없는 줄은 건너뛴다.
    const hasDash = / [—–-] /.test(line);
    if (!hadBullet && !hasDash) continue;
    // 콜론으로 끝나는 안내성 줄도 스킵(불릿이 붙어도 헤드라인 아님).
    if (!hasDash && /[:：]\s*$/.test(line)) continue;

    let title = line;
    let source = '뉴스';
    if (hasDash) {
      // 마지막 " — "/" - " 를 출처 구분자로 사용.
      const m = line.match(/^(.*) [—–-] ([^—–-]+)$/);
      if (m) {
        title = (m[1] ?? '').trim();
        source = (m[2] ?? '').trim() || '뉴스';
      }
    }
    if (title === '') continue;

    const chunk = chunks[items.length]?.web;
    items.push({
      title,
      source,
      url: chunk?.uri,
      summary: title,
    });
  }

  return items.slice(0, MAX_NEWS_ITEMS);
}

/**
 * Gemini Google Search grounding 으로 '{query}' 관련 최신 KBO/야구 뉴스 5건을 검색한다.
 *
 * best-effort:
 *  - GOOGLE_API_KEY 없음 → null.
 *  - LLM 오류/빈 응답/파싱 0건 → null(throw 금지).
 *
 * @returns NewsItem[] (1~5건) 또는 null
 */
export async function searchNews(query: string): Promise<NewsItem[] | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    return null; // 키 없음 → grounding 비활성(폴백 경로).
  }

  const topic = normalizeSpaces(query);
  if (topic === '') {
    return null;
  }

  try {
    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
      maxOutputTokens: SEARCH_MAX_OUTPUT_TOKENS,
      // grounding 은 검색·정리에 thinking 이 필요 — 0 이면 1건만 생성됨(실측). 소량 부여.
      thinkingConfig: { thinkingBudget: SEARCH_THINKING_BUDGET },
    }).bindTools([{ googleSearch: {} } as never]);

    const prompt =
      `KBO/야구 맥락에서 '${topic}' 관련 최신 뉴스 5건을 검색해 각 건을 한 줄로 ` +
      `"제목 — 출처" 형식으로 보여줘. 마크다운 불릿(*)으로 5줄만 출력해. ` +
      `수치/사실을 임의로 생성하지 말고, 검색 결과에 있는 내용만 사용해.`;

    const handler = getLangfuseHandler();
    const callbacks = handler ? [handler] : undefined;
    const response = await model.invoke(
      prompt,
      callbacks ? { callbacks } : undefined,
    );

    const text = contentToText(response.content);
    const grounding = (response.response_metadata as
      | Record<string, unknown>
      | undefined)?.groundingMetadata as GroundingMetadataLoose | undefined;

    const items = parseNewsFromResponse(text, grounding);
    return items.length > 0 ? items : null; // 파싱 0건 → 폴백.
  } catch {
    // LLM/네트워크/쿼터 오류 → best-effort null(그래프 진행, news-graph 폴백).
    return null;
  }
}
