'use client';

import { CopilotKit } from '@copilotkit/react-core';
import type { ReactNode } from 'react';

/**
 * CopilotKit Provider (ADR-016 LangGraph-over-HTTP)
 *
 * - runtimeUrl="/api/copilotkit": Next rewrite(next.config.mjs)로
 *   api(3001) /copilotkit 로 프록시된다 (same-origin → CORS 회피).
 * - agent="batdi": api 측 CopilotRuntime.agents 의 키와 1:1 일치.
 * - threadId / runId(UUID)는 CopilotKitProvider가 자동 생성하므로
 *   프론트 코드에서 별도 처리 불필요.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="batdi">
      {children}
    </CopilotKit>
  );
}
