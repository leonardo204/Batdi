// ⚠️ 반드시 최상단: @copilotkit/runtime require 전에 텔레메트리 env 설정.
import './bootstrap-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { createCopilotKitRouter } from './copilotkit.controller';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS: web(3000) 허용 (P0 — 단일 오리진)
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  // CopilotKit v2 런타임 라우터 마운트 (/copilotkit/*).
  // v2/express 핸들러가 /info, /threads, /agent/:id/run|connect|stop 등을
  // basePath('/copilotkit') 하위에서 직접 라우팅한다.
  app.use(createCopilotKitRouter());

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[batdi-api] listening on http://localhost:${port}`);
}

void bootstrap();
