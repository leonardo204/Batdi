/**
 * PersonalAgent 서비스 (P2-W6 6.3) — 개인화 컨텍스트 조립
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.5 (PersonalContext),
 *       §9.1 (프롬프트 계층 priority=3), §4.2 (L0 캐시는 비개인화 응답만)
 *
 * 책임:
 *  - buildContext(userId): DB(User·PersonalAgentState)에서 PersonalContext 를 조립한다.
 *    두 조회(PersonalAgentState findUnique + User findUnique)는 의존성이 없어 Promise.all 병렬.
 *  - isPersonalized(ctx): 응답이 개인화되었는지(customPersona/favorites) 판정 → L0 캐시 가드.
 *
 * best-effort 계약: getPrisma() 가 undefined(DB 비활성)거나, userId 가 없거나, 레코드가
 *   없거나, 조회가 throw 해도 절대 throw 하지 않는다. 모든 실패는 중립 기본값(DEFAULT_*,
 *   개인화 없음)으로 graceful 폴백한다 — 그래프는 DB 없이도 정상 동작해야 한다.
 */
import type { PersonalContext, TeamId } from '@batdi/types';
import { getPrisma } from '../utils/prisma';

/** 우선 지원 4팀 (User.teamId 는 String 이라 런타임 narrowing 필요) */
const SUPPORTED_TEAMS: readonly TeamId[] = ['lotte', 'doosan', 'kia', 'hanwha'];

/**
 * 중립 기본값 — DB 없음/없는 사용자/조회 실패 시 반환(개인화 전혀 없음).
 * isPersonalized() 가 false 가 되도록 customPersona=null, favoritePlayerIds=[].
 */
export const DEFAULT_PERSONAL_CONTEXT: PersonalContext = {
  profile: {
    teamId: null,
    knowledgeLevel: 'beginner',
    customPersona: null,
    favoritePlayerIds: [],
    longTermSummary: null,
  },
  session: {
    messageCount: 0,
    lastActiveIso: null,
  },
  hints: {
    isReturningUser: false,
    hasCustomPersona: false,
  },
};

/**
 * User.level → knowledgeLevel 파생(순수 함수 — 테스트 용이).
 * 1-2 beginner / 3-5 core / 6+ expert. level 미지정(null/undefined)이면 'beginner'.
 */
export function deriveKnowledgeLevel(
  level: number | null | undefined,
): PersonalContext['profile']['knowledgeLevel'] {
  if (typeof level !== 'number' || level <= 2) {
    return 'beginner';
  }
  if (level <= 5) {
    return 'core';
  }
  return 'expert';
}

/** User.teamId(String) → TeamId | null (우선 지원 4팀만 인정) */
function narrowTeamId(teamId: string | null | undefined): TeamId | null {
  return teamId != null && SUPPORTED_TEAMS.includes(teamId as TeamId)
    ? (teamId as TeamId)
    : null;
}

/**
 * DB 에서 개인화 컨텍스트를 조립한다(best-effort, 절대 throw 금지).
 *
 * @param userId 조회 대상 사용자 UUID (없으면 즉시 중립 기본값)
 * @returns PersonalContext (실패/없음 시 DEFAULT_PERSONAL_CONTEXT)
 */
export async function buildContext(
  userId: string | undefined,
): Promise<PersonalContext> {
  if (userId === undefined || userId.trim() === '') {
    return DEFAULT_PERSONAL_CONTEXT;
  }

  const prisma = getPrisma();
  if (!prisma) {
    // DB 비활성(DATABASE_URL 없음 등) → 중립 기본값(개인화 없음).
    return DEFAULT_PERSONAL_CONTEXT;
  }

  try {
    // 의존성 없는 두 조회를 병렬로(SSOT §4.7 — 단, 여기선 동일 DB 두 row 조회).
    const [agentState, user] = await Promise.all([
      prisma.personalAgentState.findUnique({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);

    // 두 레코드 모두 없으면(신규/미등록 사용자) 중립 기본값.
    if (!agentState && !user) {
      return DEFAULT_PERSONAL_CONTEXT;
    }

    const customPersona = agentState?.customPersona ?? null;
    const favoritePlayerIds = agentState?.favoritePlayers ?? [];
    const messageCount = agentState?.messageCount ?? 0;
    const lastActive = agentState?.lastActive ?? user?.lastActive ?? null;

    return {
      profile: {
        teamId: narrowTeamId(user?.teamId),
        knowledgeLevel: deriveKnowledgeLevel(user?.level),
        customPersona,
        favoritePlayerIds,
        // 9.2: 장기 프로필 요약(세션 간 학습 결과). 9.4 learnFromConversation 이 채우는
        //   자리지만 현재는 DB 값(profileSummary)을 그대로 읽어 노출만 한다(없으면 null).
        longTermSummary: agentState?.profileSummary ?? null,
      },
      session: {
        messageCount,
        lastActiveIso: lastActive ? lastActive.toISOString() : null,
      },
      hints: {
        isReturningUser: messageCount > 0,
        hasCustomPersona: customPersona !== null && customPersona.trim() !== '',
      },
    };
  } catch {
    // 조회 실패(연결 실패 등) → graceful 중립 기본값(그래프는 정상 진행).
    return DEFAULT_PERSONAL_CONTEXT;
  }
}

/**
 * 응답이 개인화되었는지 판정한다(L0 캐시 포이즌 가드용 — §4.2).
 * customPersona 가 비어있지 않거나 favoritePlayerIds 가 1개 이상이면 true.
 * true 면 비개인화 키로 L0 캐시 write 를 금지해야 한다(다른 사용자 누출 방지).
 */
export function isPersonalized(ctx: PersonalContext | undefined): boolean {
  if (!ctx) {
    return false;
  }
  const persona = ctx.profile.customPersona;
  const hasPersona = persona !== null && persona.trim() !== '';
  return hasPersona || ctx.profile.favoritePlayerIds.length > 0;
}
