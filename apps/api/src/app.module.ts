import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { HealthController } from './health.controller';

// CopilotKit v2 런타임은 NestJS 컨트롤러가 아니라 Express Router 로 마운트한다
// (main.ts 의 app.use). v2 멀티라우트 정규식 매칭이 NestJS 라우터와 충돌하지 않도록
// 분리한 것 — createCopilotKitRouter() 참조.
@Module({
  imports: [],
  controllers: [AppController, HealthController],
  providers: [],
})
export class AppModule {}
