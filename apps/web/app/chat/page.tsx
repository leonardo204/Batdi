'use client';

import { CopilotChat } from '@copilotkit/react-ui';

/**
 * 밧디 채팅 화면 (ADR-016 라운드트립 실증용 최소 UI)
 *
 * CopilotChat → CopilotKit Provider(runtimeUrl=/api/copilotkit, agent="batdi")
 *   → api(3001) CopilotRuntime → LangGraphAgent → agent(8123) graph
 *
 * threadId 는 CopilotKitProvider가 자동 생성한다(별도 처리 불필요).
 */
export default function ChatPage() {
  return (
    <main
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg)',
      }}
    >
      <CopilotChat
        labels={{
          title: '밧디 — 너의 야구 친구',
          initial: '🦇 안녕! 야구 얘기 뭐든 물어봐.',
          placeholder: '메시지를 입력하세요…',
        }}
        className="flex-1"
      />
    </main>
  );
}
