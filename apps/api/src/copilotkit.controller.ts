import { All, Controller, Req, Res } from '@nestjs/common';
import {
  CopilotRuntime,
  EmptyAdapter,
  copilotRuntimeNestEndpoint,
} from '@copilotkit/runtime';
// LangGraphAgent 는 /langgraph 서브패스에서 import (실 클래스 — constructor(config)).
// 루트 엔트리의 동명 export 는 deprecated 스텁(생성자 0 인자)이라 타입 불일치 발생.
import { LangGraphAgent } from '@copilotkit/runtime/langgraph';
import type { Request, Response } from 'express';

// 텔레메트리 비활성화는 src/bootstrap-env.ts 에서 (이 모듈의 copilotkit require 전에)
// 처리한다. 여기서 설정하면 이미 require 가 끝난 뒤라 늦다.

/**
 * CopilotKit Runtime 엔드포인트 (ADR-016 LangGraph-over-HTTP)
 *
 * web(3000) → (next rewrite /api/copilotkit) → api(3001) /copilotkit
 *   → CopilotRuntime → LangGraphAgent(HTTP) → agent(8123) langgraphjs dev
 *
 * - serviceAdapter = EmptyAdapter: LLM 호출은 LangGraph 노드 내부에서만 수행.
 *   (런타임 자체는 LLM을 직접 호출하지 않음 — agent 그래프가 전담)
 * - LangGraphAgent: deploymentUrl(=langgraphjs dev 서버) + graphId("batdi").
 *   ※ LangGraphHttpAgent 아님 — 해당 경로는 404 (PoC 검증).
 * - threadId/runId(UUID)는 CopilotKitProvider(web)가 자동 생성하므로
 *   서버 측 별도 처리 불필요.
 */
@Controller()
export class CopilotKitController {
  private readonly handler = copilotRuntimeNestEndpoint({
    runtime: new CopilotRuntime({
      agents: {
        batdi: new LangGraphAgent({
          deploymentUrl: process.env.LANGGRAPH_URL ?? 'http://localhost:8123',
          graphId: 'batdi',
        }),
      },
    }),
    serviceAdapter: new EmptyAdapter(),
    endpoint: '/copilotkit',
  });

  // 베이스 경로(/copilotkit) — v1.60 nest 엔드포인트는 single-route 프로토콜.
  // 모든 호출이 { method, params, body } JSON 엔벌로프로 이 경로에 POST 된다
  // (info / agent/run / agent/connect / agent/stop / transcribe).
  @All('copilotkit')
  async copilotkitBase(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handler(req, res);
  }

  // 서브 경로 — v2 path 기반 라우팅(/copilotkit/agent/<id>/run) 클라이언트 호환용.
  // (현행 CopilotKitProvider 는 single-route 를 쓰므로 필수는 아니나 미래 대비.)
  @All('copilotkit/*')
  async copilotkitSub(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handler(req, res);
  }
}
