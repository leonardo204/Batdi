/**
 * ConversationSummaryService — 세션 최종 요약기 (P3-W9 9.3 세션 종료 트리거).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.5 (메모리/PersonalContext),
 *       CLAUDE.md 불변식 "팩트(수치)는 절대 LLM 이 생성 금지" + "best-effort 영속화".
 *
 * 책임: summarizeConversation(conversationId) — 해당 대화의 Message 들을 시간순으로 모아
 *   gemini-2.5-flash-lite 로 **세션 최종 요약 1단락**(개인화 단서 위주, 수치 환각 금지)을 만들고
 *   Conversation.summary + summarizedAt=now 를 update 한다.
 *
 * 안전 속성(best-effort, agent/services/memory.ts summarizeOverflow 와 동일 톤):
 *  - 메시지 없음 → null (LLM 미호출, summary 미변경).
 *  - GOOGLE_API_KEY 없음 → null (LLM 미호출).
 *  - LLM 오류/빈 응답 → null (summary 미변경). 절대 throw 하지 않는다.
 *  - 요약은 응원팀·관심선수·말투·관심사·주요 질문 주제 위주 1~3문장. 점수/기록/날짜 등
 *    수치를 새로 지어내지 않는다(환각 금지 — 프롬프트로 강제).
 */
import { Injectable, Logger } from '@nestjs/common';
import { SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PrismaService } from '../prisma/prisma.service';

/** 요약 트랜스크립트에 포함할 메시지 상한(최근 N건, createdAt asc 의 마지막 N). */
export const SUMMARY_MESSAGE_LIMIT = 200;

/** 세션 최종 요약 시스템 지시(개인화 단서 위주, 환각 금지). */
const FINAL_SUMMARY_DIRECTIVE = `너는 대화 세션 요약기다.
아래 한 세션의 대화 전체를 읽고, 사용자에 대해 다음 세션에서 기억할 만한 개인화 단서를
1~3문장으로 요약하라.
- 우선 담을 것: 응원팀, 관심 선수, 말투·호칭 선호, 관심사(관전 포인트 등), 주요 질문 주제.
- 절대 금지: 점수·기록·날짜·순위 등 수치를 새로 지어내지 마라(대화에 없으면 쓰지 마라).
- 한국어 한 단락(머리말·따옴표 없이 내용만).`;

@Injectable()
export class ConversationSummaryService {
  private readonly logger = new Logger(ConversationSummaryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 대화 1건을 세션 최종 요약하고 Conversation.summary + summarizedAt 를 갱신한다(best-effort).
   *
   * @param conversationId 대화 UUID
   * @returns 요약 문자열, 또는 null(메시지 없음·키 없음·LLM 오류·빈 응답)
   */
  async summarizeConversation(conversationId: string): Promise<string | null> {
    if (!conversationId || conversationId.trim() === '') {
      return null;
    }

    // 1) 메시지 로드(createdAt asc, 상한 200건). 비어있으면 LLM 호출 없이 null.
    const messages = await this.loadMessages(conversationId);
    if (messages.length === 0) {
      return null;
    }

    // 2) 키 없으면 요약 생략(no-op, summary 미변경).
    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey === undefined || apiKey.trim() === '') {
      return null;
    }

    // 3) Flash-Lite 로 최종 요약(best-effort). 오류/빈 응답 → null.
    const summary = await this.runSummary(messages, apiKey);
    if (summary === null) {
      return null;
    }

    // 4) summary + summarizedAt=now 갱신.
    try {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { summary, summarizedAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(`대화 요약 update 실패(${conversationId}): ${String(err)}`);
      return null;
    }

    return summary;
  }

  /** 메시지 로드 — createdAt asc, 상한 SUMMARY_MESSAGE_LIMIT(오래된 쪽 우선). best-effort. */
  private async loadMessages(
    conversationId: string,
  ): Promise<{ role: string | null; content: string }[]> {
    try {
      return await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: SUMMARY_MESSAGE_LIMIT,
        select: { role: true, content: true },
      });
    } catch (err) {
      this.logger.warn(`메시지 로드 실패(${conversationId}): ${String(err)}`);
      return [];
    }
  }

  /** Flash-Lite 요약 호출(thinking OFF, 짧은 출력). 오류/빈 응답 → null. */
  private async runSummary(
    messages: { role: string | null; content: string }[],
    apiKey: string,
  ): Promise<string | null> {
    try {
      const transcript = messages
        .map((m) => {
          const role = m.role ?? 'user';
          const text = (m.content ?? '').trim();
          return text === '' ? '' : `${role}: ${text}`;
        })
        .filter((line) => line !== '')
        .join('\n');

      if (transcript === '') {
        return null;
      }

      const systemPrompt = `${FINAL_SUMMARY_DIRECTIVE}

<dialogue>
${transcript}
</dialogue>`;

      const model = new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash-lite',
        apiKey,
        // flash-lite 도 thinking 모델 — 짧은 요약엔 추론 불필요. thinkingBudget:0 으로 끄지
        // 않으면 maxOutputTokens 가 reasoning 에 소진돼 요약이 잘린다(memory.ts 와 동일).
        maxOutputTokens: 256,
        thinkingConfig: { thinkingBudget: 0 },
      });

      const response = await model.invoke([new SystemMessage(systemPrompt)]);
      const trimmed = contentToText(response.content).trim();
      return trimmed === '' ? null : trimmed;
    } catch (err) {
      this.logger.warn(`Flash-Lite 요약 실패: ${String(err)}`);
      return null;
    }
  }
}

/** BaseMessage.content(string | parts) → 평문 문자열. */
function contentToText(content: BaseMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}
