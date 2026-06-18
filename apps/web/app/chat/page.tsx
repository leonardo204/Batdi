'use client';

// ⚠️ A2UI 렌더는 react-core/v2 의 CopilotChat 에서만 동작한다.
//   @copilotkit/react-ui 의 CopilotChat(v1)은 일반 텍스트 메시지는 렌더하나
//   `a2ui-surface` activity 를 렌더하는 시스템(renderActivityMessages /
//   useRenderActivityMessage)을 갖지 않는다(react-ui dist 실측: a2ui/
//   renderActivityMessages 토큰 0). 그 결과 백엔드가 a2ui-surface activity 를
//   정상 방출(SSE 헤드리스·브라우저 실측 동일)해도 카드가 픽셀 렌더되지 않는다.
//   react-core/v2 CopilotChat 은 a2ui activity 를 A2UIMessageRenderer 로 렌더한다.
//   (Provider a2ui prop + runtime info a2uiEnabled:true 로 자동 활성). ADR-021.
import { CopilotChat } from '@copilotkit/react-core/v2';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ActionResultOverlay,
  type ActionResult,
} from './components/ActionResultOverlay';
import { ChatLoadingOverlay } from './components/ChatLoadingOverlay';
import { useBatdiActions } from './hooks/useBatdiActions';

// GET /api/auth/me 응답(부분)
type AuthUser = { id: string; teamId?: string | null };
type MeResponse = { user: AuthUser; onboarded: boolean };

/**
 * 밧디 채팅 화면 (ADR-016 라운드트립 + ADR-020/021 A2UI 렌더)
 *
 * CopilotChat(v2) → CopilotKit Provider(runtimeUrl=/api/copilotkit, a2ui)
 *   → api(3001) CopilotRuntime → LangGraphAgent → agent(8123) graph
 *
 * - agentId="batdi": api 측 CopilotRuntime.agents 키와 1:1 일치.
 * - threadId 는 CopilotChat 이 자동 생성한다(별도 처리 불필요).
 *
 * 인증 가드(최소 침습): 마운트 시 GET /api/auth/me 로 확인.
 *   401 → /auth/login, onboarded=false → /onboarding 으로 redirect.
 *   확인 전엔 로딩 표시. 인증 통과 시 user.teamId 로 data-team 을 걸어 팀 악센트 반영.
 *   ⚠️ 기존 CopilotChat 렌더(<ChatSurface/>)는 변경 없음 — 래퍼만 추가.
 */
export default function ChatPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<'checking' | 'ready'>('checking');
  // 인증된 사용자 신원 — useBatdiActions 의 useCopilotReadable 컨텍스트로 전달.
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (cancelled) return;
        if (res.status === 401 || !res.ok) {
          router.replace('/auth/login');
          return;
        }
        const data = (await res.json()) as MeResponse;
        if (!data.onboarded) {
          router.replace('/onboarding');
          return;
        }
        // 팀 악센트 반영(전역 data-team)
        if (data.user.teamId) {
          document.documentElement.setAttribute('data-team', data.user.teamId);
        }
        setAuthUser(data.user);
        setAuthState('ready');
      } catch {
        if (!cancelled) router.replace('/auth/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // 인증 확인 중 — 로딩 표시
  if (authState === 'checking') {
    return (
      <main
        style={{
          height: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-base)',
        }}
      >
        확인 중…
      </main>
    );
  }

  return <ChatSurface user={authUser} />;
}

/** 기존 CopilotChat 렌더 — 인증 통과 후에만 마운트. 렌더 로직 변경 금지. */
function ChatSurface({ user }: { user: AuthUser | null }) {
  // showPlayerDetail/showTeamComparison 결과를 띄울 오버레이 상태(이 컴포넌트 소유).
  const [overlay, setOverlay] = useState<ActionResult | null>(null);

  // P4-W10 10.1: 밧디 프론트엔드 액션 등록(registerFavoritePlayer 외). 렌더 영향 없음.
  // CopilotKit Provider 하위(이 트리)에서 호출 → POST /copilotkit body.tools 로 액션 전송.
  // onShowResult: 선수상세/팀비교 액션 결과가 오면 오버레이를 연다(액션 반환값은 LLM 후속용 유지).
  useBatdiActions({
    userId: user?.id,
    teamId: user?.teamId ?? undefined,
    onShowResult: setOverlay,
  });

  return (
    <main
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg)',
      }}
    >
      <ActionResultOverlay result={overlay} onClose={() => setOverlay(null)} />
      <CopilotChat
        agentId="batdi"
        labels={{
          modalHeaderTitle: '밧디 — 너의 야구 친구',
          welcomeMessageText: '🦇 안녕! 야구 얘기 뭐든 물어봐.',
          chatInputPlaceholder: '메시지를 입력하세요…',
        }}
        // 입력창 "+" 첨부/도구 메뉴(AddMenuButton) 비활성.
        // ① 야구 챗봇엔 파일 첨부가 불필요하고, ② 해당 버튼의 내부 DropdownMenuTrigger가
        //   Radix Slot 에 ref 를 넘기며 react-core dist 의 forwardRef 누락으로
        //   "Function components cannot be given refs" dev 경고를 유발한다(라이브러리
        //   내부 이슈, node_modules 라 직접 수정 불가). 버튼 자체를 빈 슬롯으로 치환해 제거.
        input={{ addMenuButton: () => null }}
        style={{ flex: 1, minHeight: 0 }}
      />
      {/* CLS 0 로딩 UX (uiux §5.4): RunStarted ~ 첫 어시스턴트 토큰 전까지
          TypingIndicator + intent별 SkeletonCard 를 채팅 영역 하단에 노출.
          어시스턴트 스트리밍 개시 시 자동 소멸(in-place 근사 swap).
          ⚠️ CopilotChat 이 메시지 리스트 렌더를 소유해 내부 슬롯 주입 불가 →
             하단 자리표시로 표시(ChatLoadingOverlay 주석의 한계 참조). */}
      <ChatLoadingOverlay agentId="batdi" />
    </main>
  );
}
