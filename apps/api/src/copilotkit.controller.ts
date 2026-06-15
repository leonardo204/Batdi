import type { Router } from 'express';
// v2 런타임 (single-endpoint 전송) — 프론트 @copilotkit/react-core@1.60 의
// 공개 <CopilotKit> 프로바이더는 useSingleEndpoint 기본값이 true 라
// (react-core dist copilotkit-*.mjs: `useSingleEndpoint: props.useSingleEndpoint ?? true`)
// 내부 @copilotkit/core 의 _runtimeTransport 가 "single" 로 고정된다. 그 결과
// 클라이언트는 GET /info 등 하위 경로 대신 다음 단일 경로만 호출한다:
//   POST {runtimeUrl}            {method:"info"}
//   POST {runtimeUrl}            {method:"agent/run",     params:{agentId}}
//   POST {runtimeUrl}            {method:"agent/connect", params:{agentId}}
//   POST {runtimeUrl}            {method:"agent/stop",    params:{agentId,threadId}}
//   POST {runtimeUrl}            {method:"threads/..."}
// (core dist index.mjs: fetchRuntimeInfoSingle → POST runtimeUrl {method:"info"})
// 따라서 v2 핸들러를 mode:"single-route" 로 마운트해야 한다. multi-route 는
// bare POST /copilotkit {method} 를 받지 않아 404 가 난다(브라우저 Network 실증).
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
 * web(3000) → (next rewrite /api/copilotkit) → api(3001) POST /copilotkit
 *   → CopilotRuntime(v2, single-route) → LangGraphAgent(HTTP) → agent(8123) langgraphjs dev
 *
 * - mode:"single-route" 는 basePath('/copilotkit') 단일 POST 엔드포인트에서
 *   JSON envelope({method,params,body})를 디스패치한다
 *   (runtime dist v2 fetch-handler: parseMethodCall → info/agent.run/... 라우팅).
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
    // 클라이언트(@copilotkit/core, useSingleEndpoint 기본 true)가 bare
    // POST /copilotkit {method} 만 호출하므로 single-route 로 마운트한다.
    mode: 'single-route',
    // CORS 는 NestFactory(app.enableCors)에서 일괄 처리하므로 라우터 자체 CORS 는 끈다.
    cors: false,
  });
}
