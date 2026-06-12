'use client';

import { CopilotKit } from '@copilotkit/react-core';
import type { ReactNode } from 'react';

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

/**
 * CopilotKit Provider (ADR-016 LangGraph-over-HTTP)
 *
 * - runtimeUrl="/api/copilotkit": Next rewrite(next.config.mjs)로 api(3001) /copilotkit
 *   하위 v2 멀티라우트(/info, /threads, /agent/:id/run|connect|stop)로 프록시된다.
 * - agent="batdi": api 측 CopilotRuntime(v2).agents 의 키와 1:1 일치.
 * - threadId / runId(UUID)는 CopilotKit 클라이언트가 자동 생성한다.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="batdi">
      {children}
    </CopilotKit>
  );
}
