/**
 * ConversationStore 서비스 (P3-W9 9.3/9.4 — 대화/메시지 영속화 + messageCount write-through)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.5 (메모리/PersonalContext),
 *       Ref-docs/specs/interface/batdi-db-schema.md A그룹(conversations·messages)·
 *       B그룹(personal_agent_state),
 *       CLAUDE.md 불변식 "PersonalAgent 상태는 Write-through(messageCount 즉시 DB 반영)".
 *
 * 책임:
 *  - resolveConversation(userId, threadId): thread_id 로 Conversation 을 멱등 upsert 하고
 *    {conversationId, sessionSummary} 를 반환한다. personalContext 노드가 9.2 의
 *    prevSessionSummary(Conversation.summary)를 채우는 데 쓴다.
 *  - persistTurn(...): 한 턴의 user/assistant Message 2건을 insert 하고 Conversation 을 touch
 *    한다(idle 트리거 9.3 가 updated_at 을 사용하므로 명시적 update).
 *  - bumpMessageCount(userId): PersonalAgentState.messageCount 를 write-through 증분한다.
 *
 * best-effort 계약: getPrisma() undefined(DB 비활성)·인자 누락·레코드 없음·조회 실패 등
 *   모든 실패는 절대 throw 하지 않는다(영속화는 응답 경로를 막지 않는다). resolve 류는 null,
 *   persist/bump 는 조용히 skip 한다 → 그래프는 DB 없이도 정상 동작.
 *
 * ⚠️ User 존재 확인 필수: conversations.user_id 는 users(id) FK(ON DELETE CASCADE)라
 *   미등록/익명 userId 로 create 하면 FK 위반으로 throw 한다. resolveConversation 은
 *   User 존재를 먼저 확인하고 없으면 null 을 반환해 영속화 자체를 건너뛴다.
 */
import { Prisma } from '@prisma/client';
import { getPrisma } from '../utils/prisma';
import { xpFromMessageCount, computeLevel } from './level-agent';

/** 한 턴당 messageCount 증가량 = user 메시지 1 + assistant 메시지 1 = 2. */
export const MESSAGE_COUNT_PER_TURN = 2;

/**
 * thread_id 로 Conversation 을 멱등 upsert 하고 식별자·세션 요약을 반환한다(best-effort).
 *
 * @param userId   인증 사용자 UUID (없으면 null — 익명/미배선)
 * @param threadId LangGraph run 의 thread_id (없으면 null — 영속화 불가)
 * @returns {conversationId, sessionSummary} 또는 null(인자 누락·DB 비활성·미등록 사용자·실패)
 */
export async function resolveConversation(
  userId: string | undefined,
  threadId: string | undefined,
): Promise<{ conversationId: string; sessionSummary: string | null } | null> {
  if (
    userId === undefined ||
    userId.trim() === '' ||
    threadId === undefined ||
    threadId.trim() === ''
  ) {
    return null;
  }

  const prisma = getPrisma();
  if (!prisma) {
    return null; // DB 비활성 → 영속화 skip(best-effort)
  }

  try {
    // FK 위반 방지: 미등록/익명 userId 면 Conversation create 가 실패하므로 사전 차단.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return null;
    }

    // thread_id(unique) 멱등 upsert — 첫 턴이면 create, 이후 턴이면 기존 row 재사용.
    const conversation = await prisma.conversation.upsert({
      where: { threadId },
      create: { userId, threadId },
      update: {},
    });

    return {
      conversationId: conversation.id,
      sessionSummary: conversation.summary ?? null,
    };
  } catch {
    return null; // 조회/upsert 실패 → graceful null(그래프는 정상 진행)
  }
}

/**
 * 한 턴의 user/assistant Message 2건을 insert 하고 Conversation 을 touch 한다(best-effort).
 *
 * Conversation.updated_at 은 @updatedAt(자동)이지만, idle 세션 요약 트리거(9.3)가 이 값을
 * 기준으로 동작하므로 명시적 update 로 touch 한다(메시지 insert 만으로는 갱신되지 않음).
 *
 * @param input.conversationId 대상 대화 UUID (resolveConversation 결과)
 * @param input.userText       사용자 입력 평문(state.userMessage)
 * @param input.assistantText  어시스턴트 응답 평문(없으면 빈 문자열 허용 — 카드 전용 경로)
 * @param input.a2uiEnvelope   assistant Message 에 함께 보관할 A2UI envelope(JSON)
 */
export async function persistTurn(input: {
  conversationId: string;
  userText: string;
  assistantText: string;
  a2uiEnvelope?: unknown;
}): Promise<void> {
  const { conversationId, userText, assistantText, a2uiEnvelope } = input;
  if (conversationId.trim() === '') {
    return;
  }

  const prisma = getPrisma();
  if (!prisma) {
    return; // DB 비활성 → skip
  }

  try {
    await prisma.message.createMany({
      data: [
        {
          conversationId,
          role: 'user',
          content: userText,
        },
        {
          conversationId,
          role: 'assistant',
          content: assistantText,
          // a2uiEnvelope 는 nullable JSONB. undefined 면 Prisma.JsonNull 로 NULL 저장.
          a2uiEnvelope:
            a2uiEnvelope === undefined
              ? Prisma.JsonNull
              : (a2uiEnvelope as Prisma.InputJsonValue),
        },
      ],
    });

    // idle 트리거(9.3)용 updated_at touch — @updatedAt 은 update 시에만 갱신된다.
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  } catch {
    // 영속화 실패는 무시(응답은 이미 방출됨). best-effort.
  }
}

/**
 * PersonalAgentState.messageCount 를 write-through 증분한다(best-effort).
 *
 * CLAUDE.md 불변식: messageCount/last_active 는 이벤트 즉시 DB 반영(인메모리는 읽기 캐시만).
 * 한 턴 = user+assistant = MESSAGE_COUNT_PER_TURN(2) 증가. row 없으면 create.
 *
 * @param userId 인증 사용자 UUID (없으면 null)
 * @returns 갱신된 messageCount 또는 null(인자 누락·DB 비활성·실패)
 */
export async function bumpMessageCount(
  userId: string,
): Promise<number | null> {
  if (userId.trim() === '') {
    return null;
  }

  const prisma = getPrisma();
  if (!prisma) {
    return null; // DB 비활성 → skip
  }

  try {
    const now = new Date();
    const row = await prisma.personalAgentState.upsert({
      where: { userId },
      create: {
        userId,
        messageCount: MESSAGE_COUNT_PER_TURN,
        lastActive: now,
      },
      update: {
        messageCount: { increment: MESSAGE_COUNT_PER_TURN },
        lastActive: now,
      },
    });
    return row.messageCount;
  } catch {
    return null; // upsert 실패(FK 위반 등) → graceful null
  }
}

/**
 * XP/level 멱등 recompute write-through 훅 (P4-W10 10.3 — ADR-049, best-effort).
 *
 * message_count(turns) 를 소스 of truth 로 xp/level 을 **항상 재계산**해 users 에 반영한다
 * (증분 아님 → 드리프트/중복 0). bumpMessageCount 뒤에 호출되어야 turns 가 최신이다.
 *
 * 레벨업 감지(prevLevel < newLevel)는 11.2 레벨업 푸시 트리거용으로 반환만 한다.
 *
 * best-effort 계약: getPrisma() undefined·userId 누락·users 레코드 없음(미등록/익명)·
 *   조회/update 실패 등 모든 실패는 절대 throw 하지 않고 null 을 반환한다.
 *
 * @param userId 인증 사용자 UUID
 * @returns { leveledUp, level } 또는 null(인자 누락·DB 비활성·미등록 사용자·실패)
 */
export async function updateLevelProgress(
  userId: string | undefined,
): Promise<{ leveledUp: boolean; level: number } | null> {
  if (userId === undefined || userId.trim() === '') {
    return null;
  }

  const prisma = getPrisma();
  if (!prisma) {
    return null; // DB 비활성 → skip
  }

  try {
    // FK/없는행 안전: users 레코드 없으면 update skip(익명/미등록 가드).
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return null;
    }

    // message_count(turns) → xp → level 멱등 recompute.
    const agentState = await prisma.personalAgentState.findUnique({
      where: { userId },
    });
    const messageCount = agentState?.messageCount ?? 0;
    const xp = xpFromMessageCount(messageCount);
    const newLevel = computeLevel(xp);
    const prevLevel = user.level ?? 1;

    await prisma.user.update({
      where: { id: userId },
      data: { xpPoints: xp, level: newLevel },
    });

    return { leveledUp: newLevel > prevLevel, level: newLevel };
  } catch {
    return null; // 조회/update 실패 → graceful null(응답 경로 막지 않음)
  }
}
