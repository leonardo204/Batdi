/**
 * PersonalAgentLearningService — 장기 프로필 학습기 (P3-W9 9.4
 *   "learnFromConversation — 50건마다 프로필 갱신").
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.5 (메모리/PersonalContext long-term tier),
 *       CLAUDE.md 불변식 "팩트(수치)는 절대 LLM 이 생성 금지" + "PersonalAgent 상태는 Write-through".
 *
 * 책임: learnFromConversation(userId) — 사용자의 누적 대화(messageCount)가 50건의 배수를 넘길
 *   때마다 1회, 최근 대화에서 **장기 프로필 요약**(선호 주제·말투·관심 선수/팀·자주 묻는 질의 유형)을
 *   gemini-2.5-flash-lite 로 갱신하고 PersonalAgentState.profileSummary +
 *   profileData.lastLearnedCount + lastProfileUpdate 를 update 한다.
 *   이는 9.2 의 long-term tier(PersonalContext.profile.longTermSummary = profileSummary)를
 *   채우는 쓰기 경로다.
 *
 * 멱등/트리거 설계 (스키마 변경 없음 — profileData(Json) 재사용):
 *  - profileData JSON 에 lastLearnedCount(마지막 학습 시점 messageCount)를 저장한다.
 *  - 학습 조건: messageCount - (profileData.lastLearnedCount ?? 0) >= LEARN_INTERVAL(50).
 *  - 학습 후 lastLearnedCount = messageCount, lastProfileUpdate = now.
 *  - 이렇게 하면 50·100·150… 누적마다 정확히 1회 학습(중복/누락 없음).
 *
 * 안전 속성(best-effort, conversation-summary.service.ts 와 동일 톤. 절대 throw 안 함):
 *  - PersonalAgentState 없음 → false.
 *  - 메시지 없음 → false (LLM 미호출).
 *  - GOOGLE_API_KEY 없음 → false (LLM 미호출).
 *  - LLM 오류/빈 응답 → false (profileSummary/profileData 미변경).
 *  - 요약은 선호 주제·말투·관심 선수/팀·질의 유형 위주 2~4문장. 점수/기록/날짜 등 수치를
 *    새로 지어내지 않는다(환각 금지 — 프롬프트로 강제).
 *
 * ⚠️ Batch API(Flash-Lite 50% 할인) 보류: 실 Gemini Batch API(잡 제출 + 폴링)는 미적용이며
 *   비용 최적화 후속 과제다. 현재는 conversation-summary 와 동일한 **동기 Flash-Lite 호출**로 구현한다.
 */
import { Injectable, Logger } from '@nestjs/common';
import { SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PrismaService } from '../prisma/prisma.service';

/** 학습 주기 — 누적 messageCount 가 이 값의 배수를 넘길 때마다 1회 프로필 갱신. */
export const LEARN_INTERVAL = 50;

/** 트랜스크립트에 포함할 최근 메시지 상한(createdAt desc 로 최근 N건 → asc 재정렬). */
export const LEARN_MESSAGE_LIMIT = 100;

/** profileData(Json) 안에서 마지막 학습 시점 messageCount 를 담는 키. */
export const LAST_LEARNED_COUNT_KEY = 'lastLearnedCount';

/** 장기 프로필 학습 시스템 지시(개인화 단서 위주, 환각 금지). */
const PROFILE_LEARN_DIRECTIVE = `너는 사용자의 장기 프로필 학습기다.
아래 최근 대화 묶음과 (있다면) 기존 프로필 요약을 읽고, 이 사용자를 앞으로 더 잘 응대하기 위해
기억할 장기 개인화 프로필을 2~4문장으로 갱신하라.
- 우선 담을 것: 선호하는 주제·관전 포인트, 말투·호칭 선호, 관심 선수/팀, 자주 묻는 질문 유형.
- 기존 프로필이 있으면 새 대화로 보강·정정하되 일관된 누적 요약을 유지하라.
- 절대 금지: 점수·기록·순위·날짜 등 수치를 새로 지어내지 마라(대화에 없으면 쓰지 마라).
- 한국어 2~4문장(머리말·따옴표 없이 내용만).`;

@Injectable()
export class PersonalAgentLearningService {
  private readonly logger = new Logger(PersonalAgentLearningService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 한 사용자의 장기 프로필을 갱신한다(best-effort). 트리거 조건은 호출 측에서 판정하지만,
   * 이 메서드 자체도 안전하게 동작한다(없으면 false). 절대 throw 하지 않는다.
   *
   * @param userId 사용자 UUID
   * @returns true(프로필 갱신 완료) / false(상태·메시지·키 없음, LLM 오류·빈 응답, update 실패)
   */
  async learnFromConversation(userId: string): Promise<boolean> {
    if (!userId || userId.trim() === '') {
      return false;
    }

    // 1) PersonalAgentState 로드(없으면 false). User 맥락(teamId/level)도 함께.
    const state = await this.loadState(userId);
    if (state === null) {
      return false;
    }

    // 2) 최근 메시지 로드(createdAt desc 상한 → asc 트랜스크립트). 비면 false(LLM 미호출).
    const messages = await this.loadRecentMessages(userId);
    if (messages.length === 0) {
      return false;
    }

    // 3) 키 없으면 학습 생략(no-op, 미변경).
    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey === undefined || apiKey.trim() === '') {
      return false;
    }

    // 4) Flash-Lite 로 장기 프로필 갱신(best-effort). 오류/빈 응답 → false.
    const summary = await this.runLearn(
      messages,
      state.profileSummary,
      state.teamId,
      state.level,
      apiKey,
    );
    if (summary === null) {
      return false;
    }

    // 5) profileSummary 갱신 + profileData 에 lastLearnedCount=messageCount 병합 +
    //    lastProfileUpdate=now. update 실패도 best-effort 흡수(false).
    try {
      const prevData =
        state.profileData !== null && typeof state.profileData === 'object'
          ? (state.profileData as Record<string, unknown>)
          : {};
      const nextData = {
        ...prevData,
        [LAST_LEARNED_COUNT_KEY]: state.messageCount,
      };
      await this.prisma.personalAgentState.update({
        where: { userId },
        data: {
          profileSummary: summary,
          profileData: nextData,
          lastProfileUpdate: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(`프로필 학습 update 실패(${userId}): ${String(err)}`);
      return false;
    }

    return true;
  }

  /** PersonalAgentState + User(teamId/level) 로드. 없으면 null. best-effort. */
  private async loadState(userId: string): Promise<{
    profileSummary: string | null;
    profileData: unknown;
    messageCount: number;
    teamId: string | null;
    level: number | null;
  } | null> {
    try {
      const state = await this.prisma.personalAgentState.findUnique({
        where: { userId },
        select: {
          profileSummary: true,
          profileData: true,
          messageCount: true,
          user: { select: { teamId: true, level: true } },
        },
      });
      if (state === null) {
        return null;
      }
      return {
        profileSummary: state.profileSummary ?? null,
        profileData: state.profileData,
        messageCount: state.messageCount ?? 0,
        teamId: state.user?.teamId ?? null,
        level: state.user?.level ?? null,
      };
    } catch (err) {
      this.logger.warn(`PersonalAgentState 로드 실패(${userId}): ${String(err)}`);
      return null;
    }
  }

  /**
   * 사용자의 최근 메시지 로드 — conversations.messages 를 createdAt desc 상한 N건 조회 후
   * asc(시간순)로 재정렬해 트랜스크립트로 쓴다. best-effort(오류 시 빈 배열).
   */
  private async loadRecentMessages(
    userId: string,
  ): Promise<{ role: string | null; content: string }[]> {
    try {
      const rows = await this.prisma.message.findMany({
        where: { conversation: { userId } },
        orderBy: { createdAt: 'desc' },
        take: LEARN_MESSAGE_LIMIT,
        select: { role: true, content: true },
      });
      // desc 로 가져온 최근 N건을 시간순(asc)으로 뒤집어 트랜스크립트 일관성 확보.
      return rows.reverse();
    } catch (err) {
      this.logger.warn(`최근 메시지 로드 실패(${userId}): ${String(err)}`);
      return [];
    }
  }

  /** Flash-Lite 프로필 학습 호출(thinking OFF). 오류/빈 응답 → null. */
  private async runLearn(
    messages: { role: string | null; content: string }[],
    prevSummary: string | null,
    teamId: string | null,
    level: number | null,
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

      const contextLines: string[] = [];
      if (teamId !== null && teamId.trim() !== '') {
        contextLines.push(`응원팀: ${teamId}`);
      }
      if (level !== null) {
        contextLines.push(`레벨: ${level}`);
      }
      const contextBlock =
        contextLines.length > 0
          ? `\n<user_context>\n${contextLines.join('\n')}\n</user_context>`
          : '';

      const prevBlock =
        prevSummary !== null && prevSummary.trim() !== ''
          ? `\n<existing_profile>\n${prevSummary.trim()}\n</existing_profile>`
          : '';

      const systemPrompt = `${PROFILE_LEARN_DIRECTIVE}${contextBlock}${prevBlock}

<recent_dialogue>
${transcript}
</recent_dialogue>`;

      const model = new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash-lite',
        apiKey,
        // flash-lite 도 thinking 모델 — 짧은 요약엔 추론 불필요. thinkingBudget:0 으로 끄지
        // 않으면 maxOutputTokens 가 reasoning 에 소진돼 출력이 잘린다(conversation-summary 동일).
        maxOutputTokens: 320,
        thinkingConfig: { thinkingBudget: 0 },
      });

      const response = await model.invoke([new SystemMessage(systemPrompt)]);
      const trimmed = contentToText(response.content).trim();
      return trimmed === '' ? null : trimmed;
    } catch (err) {
      this.logger.warn(`Flash-Lite 프로필 학습 실패: ${String(err)}`);
      return null;
    }
  }
}

/** BaseMessage.content(string | parts) → 평문 문자열. */
function contentToText(content: BaseMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}
