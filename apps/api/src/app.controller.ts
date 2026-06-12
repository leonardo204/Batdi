import { Controller, Get } from '@nestjs/common';

interface ApiInfo {
  service: 'batdi-api';
  note: string;
  ui: string;
  endpoints: { health: string; copilotkit: string };
}

/**
 * 루트(/) 안내. api는 백엔드이므로 브라우저로 직접 여는 곳이 아니다.
 * 실제 채팅 UI는 web(3000)의 /chat — 루트 404 혼동을 막기 위한 안내 라우트.
 */
@Controller()
export class AppController {
  @Get()
  root(): ApiInfo {
    return {
      service: 'batdi-api',
      note: '백엔드 API입니다. 채팅 UI는 web(3000)에서 여세요.',
      ui: 'http://localhost:3000/chat',
      endpoints: { health: '/health', copilotkit: '/copilotkit (CopilotKit 런타임, POST)' },
    };
  }
}
