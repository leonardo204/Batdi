// ⚠️ 반드시 최상단: @copilotkit/runtime require 전에 텔레메트리 env 설정.
import './bootstrap-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { createCopilotKitRouter } from './copilotkit.controller';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS: web(3000) 허용 (P0 — 단일 오리진)
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  // 쿠키 파서 — Auth 가드(JwtAuthGuard)가 req.cookies['batdi_token'] 을 읽으려면 필요.
  // CopilotKit 라우터/스텁보다 먼저 등록해 모든 라우트에서 req.cookies 가 채워지게 한다.
  app.use(cookieParser());

  // 대화 목록(history) REST 조회 스텁 — 라우터보다 먼저 마운트해 가로챈다.
  // @copilotkit/core 는 채팅과 별개로 GET {runtimeUrl}/threads?agentId= 로 스레드
  // 목록을 가져오는데(core dist: createThreadFetchObservable), v2 single-route
  // 핸들러는 이 GET 을 서빙하지 않아 404 노이즈가 났다. 실패는 listFailed 로 graceful
  // 처리돼 채팅 run 엔 영향 없으나, 빈 목록을 명시 반환해 404 제거 + nextCursor:null 로
  // 다음 페이지 요청까지 차단한다. MVP 는 영속 스레드가 없으므로 빈 목록이 정직한 응답이며,
  // 영속(대화기록 저장) 도입 시 이 스텁을 실제 DB 조회로 교체한다.
  app.use('/copilotkit/threads', (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET') {
      res.json({ threads: [], nextCursor: null });
      return;
    }
    next();
  });

  // CopilotKit v2 런타임 라우터 마운트 (single-route).
  // v2/express 핸들러가 basePath('/copilotkit') 단일 POST 엔드포인트에서
  // {method,params,body} envelope 를 info/agent.run/... 로 디스패치한다.
  app.use(createCopilotKitRouter());

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[batdi-api] listening on http://localhost:${port}`);
}

void bootstrap();
