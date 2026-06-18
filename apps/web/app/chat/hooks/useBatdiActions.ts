'use client';

/**
 * useBatdiActions — 밧디 프론트엔드 액션 등록 훅 (P4-W10 10.1/10.2 키스톤 수직 슬라이스).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-050)
 *
 * 키스톤 흐름: 이 훅이 useCopilotAction 으로 'registerFavoritePlayer' 액션을 등록하면
 *   CopilotKit 가 POST /copilotkit body 의 tools 로 액션 정의를 전송 →
 *   @ag-ui/langgraph 가 LangGraph run input(state.tools) 에 병합 → chat-graph 가
 *   bindTools 후 LLM tool_call → manually_emit_tool_call 커스텀 이벤트 →
 *   여기 handler 실행 → POST /api/favorites/register → user_favorites + tool_call_logs.
 *
 * ⚠️ CopilotKit Provider 하위(클라이언트 컴포넌트)에서만 호출해야 한다. 렌더 영향 없음.
 */
import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core';

/** POST /api/favorites/register 응답(부분). */
interface RegisterFavoriteResponse {
  success?: boolean;
  favoritesCount?: number;
}

/** 백엔드 검증 API 공통 호출 — same-origin /api/* 프록시 + JWT 쿠키. */
async function callApi<T>(
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  const r = await fetch(path, {
    method: init?.method ?? 'GET',
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  return (await r.json()) as T;
}

/** useBatdiActions 옵션 — 현재 사용자 신원(있으면 컨텍스트로 노출). */
export interface UseBatdiActionsOptions {
  userId?: string;
  teamId?: string;
}

export function useBatdiActions(options: UseBatdiActionsOptions = {}): void {
  // 현재 사용자 컨텍스트를 LLM 에 노출(선택) — 액션 인자 추론 보조.
  useCopilotReadable({
    description: '현재 사용자',
    value: { userId: options.userId, teamId: options.teamId },
  });

  useCopilotAction({
    name: 'registerFavoritePlayer',
    description: '사용자의 관심 선수로 등록한다',
    parameters: [
      {
        name: 'playerId',
        type: 'number',
        description: '선수 ID',
        required: true,
      },
    ],
    handler: async ({ playerId }: { playerId: number }) => {
      const r = await fetch('/api/favorites/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      return (await r.json()) as RegisterFavoriteResponse;
    },
  });

  // ── P4-W10 10.1: 6개 추가 액션 ──
  // 백엔드 검증 API 있는 4종(toggleNotification/showPlayerDetail/requestScoreRefresh/
  // showTeamComparison) + 프론트 전용 네비 2종(jumpToConversation/openPersonaEditor).
  // 액션명은 render_a2ui/log_a2ui_event 와 안 겹치도록 명시적 명명(공존 규칙).

  useCopilotAction({
    name: 'toggleNotification',
    description: '특정 종류의 푸시 알림을 켜거나 끈다',
    parameters: [
      {
        name: 'type',
        type: 'string',
        description: '알림 종류: gameStart | gameEnd | favoritePlayer | levelUp',
        required: true,
      },
    ],
    handler: async ({ type }: { type: string }) =>
      callApi('/api/notifications/toggle', { method: 'POST', body: { type } }),
  });

  useCopilotAction({
    name: 'showPlayerDetail',
    description: '선수의 상세 정보(프로필 + 당해 시즌 스탯)를 조회한다',
    parameters: [
      {
        name: 'playerId',
        type: 'number',
        description: '선수 ID',
        required: true,
      },
    ],
    handler: async ({ playerId }: { playerId: number }) =>
      callApi(`/api/players/${playerId}`),
  });

  useCopilotAction({
    name: 'requestScoreRefresh',
    description: '특정 경기의 스코어를 강제로 갱신한다(캐시 무효화)',
    parameters: [
      {
        name: 'gameId',
        type: 'string',
        description: '경기 키(gameKey)',
        required: true,
      },
    ],
    handler: async ({ gameId }: { gameId: string }) =>
      callApi('/api/scores/refresh', { method: 'POST', body: { gameId } }),
  });

  useCopilotAction({
    name: 'showTeamComparison',
    description: '두 팀의 당해 시즌 순위/기록을 비교한다',
    parameters: [
      {
        name: 'teamA',
        type: 'string',
        description: '비교 팀 A: lotte | doosan | kia | hanwha',
        required: true,
      },
      {
        name: 'teamB',
        type: 'string',
        description: '비교 팀 B: lotte | doosan | kia | hanwha',
        required: true,
      },
    ],
    handler: async ({ teamA, teamB }: { teamA: string; teamB: string }) =>
      callApi(
        `/api/stats/compare?teamA=${encodeURIComponent(teamA)}&teamB=${encodeURIComponent(teamB)}`,
      ),
  });

  // ── 프론트 전용 네비 2종(백엔드 mutation 없음) ──
  // 대상 페이지(/my/conversations, /settings)는 10.4/10.5 에서 생성. 지금은 graceful 네비.

  useCopilotAction({
    name: 'jumpToConversation',
    description: '특정 대화 페이지로 이동한다',
    parameters: [
      {
        name: 'conversationId',
        type: 'string',
        description: '이동할 대화 ID',
        required: true,
      },
    ],
    handler: async ({ conversationId }: { conversationId: string }) => {
      if (typeof window !== 'undefined') {
        window.location.href = `/my/conversations?c=${encodeURIComponent(conversationId)}`;
      }
      return { navigated: true };
    },
  });

  useCopilotAction({
    name: 'openPersonaEditor',
    description: '페르소나/설정 편집 화면을 연다',
    parameters: [],
    handler: async () => {
      if (typeof window !== 'undefined') {
        window.location.href = '/settings';
      }
      return { opened: true };
    },
  });
}
