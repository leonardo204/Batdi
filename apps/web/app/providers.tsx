'use client';

import { CopilotKit } from '@copilotkit/react-core';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

/**
 * @copilotkit/react-core@1.60.0 의 스레드 스토어는 내부적으로
 *   ɵcreateThreadStore({ fetch: globalThis.fetch })
 * 로 *언바운드* fetch 참조를 캡처한다(react-core dist 확인). 이후 rxjs `fromFetch`
 * 가 이를 `environment.fetch(...)` 형태(메서드 호출)로 부르면 `this` 가 window/globalThis
 * 가 아니라 environment 객체가 되어, 브라우저가
 *   TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation
 * 을 던진다(연결 단계 threads 조회 시점). 업스트림 버그이며 provider 에 fetch
 * 오버라이드 옵션이 없어, 클라이언트에서 globalThis.fetch 를 globalThis 에 bind 해
 * 캡처되는 참조 자체를 안전하게 만든다(모듈 평가 시 1회).
 */
if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
  const g = globalThis as typeof globalThis & { __batdiFetchBound?: boolean };
  if (!g.__batdiFetchBound) {
    g.fetch = globalThis.fetch.bind(globalThis);
    g.__batdiFetchBound = true;
  }
}

/** GET /api/auth/me 응답(부분) — 신원 주입용 최소 필드. */
type AuthUser = { id: string; teamId?: string | null };
type MeResponse = { user: AuthUser };

/**
 * 인증된 사용자의 신원을 CopilotKit properties.config.configurable 로 전달한다(P3-W9 9.3).
 *
 * 전달 채널(조사 결과): 프론트 `properties={{ config:{ configurable:{ userId, teamId } } }}`
 *   → HTTP body.forwardedProps → @ag-ui/langgraph 가 RunsStreamPayload.config 로 보존
 *   (context_schema 없음 → configurable 키 드롭 안 됨) → 에이전트 노드 2번째 인자
 *   config.configurable.userId/teamId. (flat forwardedProps 는 state 로 병합되지 않으므로
 *   config.configurable 채널을 쓴다.)
 *
 * 익명 페이지/미인증(401)에서는 properties 를 주입하지 않는다(undefined → CopilotKit 가
 * properties 자체를 생략). 인증된 사용자만 properties 가 채워진다(타입 안전).
 */
export function Providers({ children }: { children: ReactNode }) {
  // 미인증/익명 기본값 — 인증 확인 전·실패 시 properties 생략(undefined).
  const [properties, setProperties] = useState<
    { config: { configurable: { userId: string; teamId?: string } } } | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (cancelled || !res.ok) {
          return; // 401/오류 → 익명 유지(properties 생략)
        }
        const data = (await res.json()) as MeResponse;
        const userId = data.user?.id;
        if (!userId) {
          return;
        }
        const teamId = data.user.teamId ?? undefined;
        if (cancelled) {
          return;
        }
        setProperties({
          config: {
            configurable: {
              userId,
              ...(teamId ? { teamId } : {}),
            },
          },
        });
      } catch {
        // 네트워크 오류 → 익명 유지(properties 생략). 채팅 자체는 동작(개인화만 없음).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * CopilotKit Provider (ADR-016 LangGraph-over-HTTP)
   *
   * - runtimeUrl="/api/copilotkit": Next rewrite(next.config.mjs)로 api(3001) /copilotkit
   *   하위 v2 멀티라우트(/info, /threads, /agent/:id/run|connect|stop)로 프록시된다.
   * - agent="batdi": api 측 CopilotRuntime(v2).agents 의 키와 1:1 일치.
   * - threadId / runId(UUID)는 CopilotKit 클라이언트가 자동 생성한다.
   * - properties: 인증 사용자 신원(config.configurable.userId/teamId). 익명 시 생략.
   * - a2ui: A2UI 렌더 활성화(ADR-020). 백엔드 a2ui 미들웨어가 보낸 `a2ui-surface`
   *   activity 를 자동등록 A2UIMessageRenderer + A2UIRenderer(basicCatalog)로 렌더한다.
   *   theme 미지정 시 @copilotkit/a2ui-renderer 의 viewerTheme 가 사용된다.
   */
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="batdi"
      {...(properties ? { properties } : {})}
      a2ui={{}}
      // AG-UI Inspector(우하단 다이아몬드 토글 + "Slack early access…" announcement
      // 배너)는 개발 도구다. 기본 enabled 라 끈다(production 안전·UI 노이즈 제거).
      enableInspector={false}
    >
      {children}
    </CopilotKit>
  );
}
