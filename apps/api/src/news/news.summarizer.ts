/**
 * news.summarizer.ts — 기사 제목 1문장 요약기 (P3-W7 7.5, ADR-048).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-048,
 *       CLAUDE.md "팩트(수치)는 절대 LLM 이 생성 금지".
 *
 * conversation-summary.service.ts 패턴 그대로:
 *  - GOOGLE_API_KEY 없으면 null(LLM 미호출 → 호출부가 title 폴백).
 *  - gemini-2.5-flash-lite · thinkingConfig thinkingBudget:0 · maxOutputTokens ~100.
 *  - 오류/빈 응답 → null. 절대 throw 하지 않는다(best-effort).
 *  - 프롬프트로 수치 창작 금지(환각 방지) 강제.
 */
import { Injectable, Logger } from '@nestjs/common';
import { SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

/** 제목 요약 시스템 지시(1문장·수치 창작 금지). */
const NEWS_SUMMARY_DIRECTIVE = `너는 KBO 야구 뉴스 요약기다.
주어진 기사 제목을 한국어 한 문장으로 자연스럽게 요약하라.
- 제목에 없는 점수·기록·날짜·순위 등 수치를 새로 지어내지 마라(환각 금지).
- 머리말·따옴표 없이 요약 문장만 출력하라.`;

@Injectable()
export class NewsSummarizer {
  private readonly logger = new Logger(NewsSummarizer.name);

  /**
   * 기사 제목 1건을 1문장 한국어로 요약한다(best-effort).
   *
   * @param title 기사 제목
   * @returns 요약 문자열, 또는 null(키 없음·빈 제목·LLM 오류·빈 응답 → 호출부 title 폴백)
   */
  async summarize(title: string): Promise<string | null> {
    if (!title || title.trim() === '') {
      return null;
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey === undefined || apiKey.trim() === '') {
      return null; // 키 없음 → LLM 미호출(호출부가 title 폴백)
    }

    try {
      const systemPrompt = `${NEWS_SUMMARY_DIRECTIVE}

<title>
${title.trim()}
</title>`;

      const model = new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash-lite',
        apiKey,
        // flash-lite 도 thinking 모델 — 짧은 요약엔 추론 불필요. thinkingBudget:0 으로 끄지
        // 않으면 maxOutputTokens 가 reasoning 에 소진돼 요약이 잘린다(memory.ts 와 동일).
        maxOutputTokens: 100,
        thinkingConfig: { thinkingBudget: 0 },
      });

      const response = await model.invoke([new SystemMessage(systemPrompt)]);
      const trimmed = contentToText(response.content).trim();
      return trimmed === '' ? null : trimmed;
    } catch (err) {
      this.logger.warn(`뉴스 제목 요약 실패: ${String(err)}`);
      return null;
    }
  }
}

/** BaseMessage.content(string | parts) → 평문 문자열. */
function contentToText(content: BaseMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}
