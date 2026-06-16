'use client';

// ⚠️ A2UI 렌더는 react-core/v2 의 CopilotChat 에서만 동작한다.
//   @copilotkit/react-ui 의 CopilotChat(v1)은 일반 텍스트 메시지는 렌더하나
//   `a2ui-surface` activity 를 렌더하는 시스템(renderActivityMessages /
//   useRenderActivityMessage)을 갖지 않는다(react-ui dist 실측: a2ui/
//   renderActivityMessages 토큰 0). 그 결과 백엔드가 a2ui-surface activity 를
//   정상 방출(SSE 헤드리스·브라우저 실측 동일)해도 카드가 픽셀 렌더되지 않는다.
//   react-core/v2 CopilotChat 은 a2ui activity 를 A2UIMessageRenderer 로 렌더한다.
//   (Provider a2ui prop + runtime info a2uiEnabled:true 로 자동 활성). ADR-021.
import { CopilotChat } from '@copilotkit/react-core/v2';

/**
 * 밧디 채팅 화면 (ADR-016 라운드트립 + ADR-020/021 A2UI 렌더)
 *
 * CopilotChat(v2) → CopilotKit Provider(runtimeUrl=/api/copilotkit, a2ui)
 *   → api(3001) CopilotRuntime → LangGraphAgent → agent(8123) graph
 *
 * - agentId="batdi": api 측 CopilotRuntime.agents 키와 1:1 일치.
 * - threadId 는 CopilotChat 이 자동 생성한다(별도 처리 불필요).
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
        agentId="batdi"
        labels={{
          modalHeaderTitle: '밧디 — 너의 야구 친구',
          welcomeMessageText: '🦇 안녕! 야구 얘기 뭐든 물어봐.',
          chatInputPlaceholder: '메시지를 입력하세요…',
        }}
        // 입력창 "+" 첨부/도구 메뉴(AddMenuButton) 비활성.
        // ① 야구 챗봇엔 파일 첨부가 불필요하고, ② 해당 버튼의 내부 DropdownMenuTrigger가
        //   Radix Slot 에 ref 를 넘기며 react-core dist 의 forwardRef 누락으로
        //   "Function components cannot be given refs" dev 경고를 유발한다(라이브러리
        //   내부 이슈, node_modules 라 직접 수정 불가). 버튼 자체를 빈 슬롯으로 치환해 제거.
        input={{ addMenuButton: () => null }}
        style={{ flex: 1, minHeight: 0 }}
      />
    </main>
  );
}
