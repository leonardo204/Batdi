import type { Router } from 'express';
// v2 런타임 (AG-UI 멀티라우트 프로토콜) — 프론트 @copilotkit/react-core@1.60 은
// 내부적으로 @copilotkit/core(v2 클라이언트)를 사용하여 다음 경로를 호출한다:
//   GET  {runtimeUrl}/info
//   GET  {runtimeUrl}/threads?agentId=...
//   POST {runtimeUrl}/agent/{agentId}/run | /connect
//   POST {runtimeUrl}/agent/{agentId}/stop/{threadId}
//   DELETE/PUT {runtimeUrl}/threads/{threadId}
// 레거시 copilotRuntimeNestEndpoint 는 single-route({method,params,body}) 라
// 위 경로가 전부 404 → v2 핸들러로 교체한다.
import { CopilotRuntime } from '@copilotkit/runtime/v2';
import { createCopilotExpressHandler } from '@copilotkit/runtime/v2/express';
// 실 LangGraphAgent — @ag-ui/langgraph 의 AbstractAgent 파생 클래스를 래핑한 것으로,
// v2 CopilotRuntime.agents(AbstractAgent 레코드)에 그대로 등록 가능하다.
import { LangGraphAgent } from '@copilotkit/runtime/langgraph';

// 텔레메트리 비활성화는 src/bootstrap-env.ts 에서 (이 모듈의 copilotkit require 전에)
// 처리한다.

/**
 * CopilotKit v2 런타임 라우터 (ADR-016 LangGraph-over-HTTP)
 *
 * web(3000) → (next rewrite /api/copilotkit/:path*) → api(3001) /copilotkit/*
 *   → CopilotRuntime(v2) → LangGraphAgent(HTTP) → agent(8123) langgraphjs dev
 *
 * - v2/express 핸들러는 Express Router 를 반환하며,
 *   basePath('/copilotkit') 하위 모든 경로(^/copilotkit(/.*)?$)를 소유한다.
 *   → main.ts 에서 app.use(router) 로 마운트한다(NestFactory 의 Express 인스턴스).
 * - v2 에는 serviceAdapter 개념이 없다 — LLM 호출은 LangGraph 노드 내부에서만 수행.
 * - agents.batdi 의 키는 프론트 CopilotKit `agent="batdi"` 와 1:1 일치해야 한다.
 */
export function createCopilotKitRouter(): Router {
  const runtime = new CopilotRuntime({
    agents: {
      batdi: new LangGraphAgent({
        deploymentUrl: process.env.LANGGRAPH_URL ?? 'http://localhost:8123',
        graphId: 'batdi',
      }),
    },
  });

  return createCopilotExpressHandler({
    runtime,
    basePath: '/copilotkit',
    mode: 'multi-route',
    // CORS 는 NestFactory(app.enableCors)에서 일괄 처리하므로 라우터 자체 CORS 는 끈다.
    cors: false,
  });
}
