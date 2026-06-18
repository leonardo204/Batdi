'use client';

/**
 * ChatLoadingOverlay — CLS 0 로딩 UX 배선 (uiux §5.4).
 *
 * 동작(react-core/v2 `useAgent` 기반):
 *   - `useAgent({ agentId, updates:[OnRunStatusChanged, OnMessagesChanged] })` 로
 *     실행 상태(agent.isRunning)와 메시지 스트림(agent.messages)을 구독한다.
 *   - 사용자가 메시지를 전송하면 run 이 시작(isRunning=true)되고, 마지막 메시지는
 *     아직 사용자(role!=='assistant') 이거나 assistant 라도 content 가 비어 있다.
 *     → 이 구간(= RunStarted ~ 첫 어시스턴트 토큰 도착 전)에 TypingIndicator +
 *       intent별 SkeletonCard 를 노출한다.
 *   - 어시스턴트 메시지에 content/도구호출이 채워지기 시작하면(스트리밍 개시) 즉시
 *     숨긴다(=in-place swap: 자리표시 → 실제 메시지/A2UI 카드).
 *
 * 한계(명시):
 *   - CopilotChat(v2)이 메시지 리스트 렌더를 소유하므로, 본 오버레이는 CopilotChat
 *     "내부 메시지 슬롯"에 주입되지 않는다. 대신 채팅 영역 하단에 고정 배치되는
 *     별도 자리표시로 표시한다(억지 내부 패치 금지 — 작업 지침). 따라서 완벽한
 *     픽셀 단위 in-place swap 이 아니라 "하단 자리표시 → 실제 카드 등장" 의 근사
 *     swap 이다. variant 별 고정 높이로 swap 시 점프를 최소화한다(CLS 0 목표).
 *   - variant 추정은 직전 사용자 입력 키워드 기반(백엔드 IntentRouter 경량 미러).
 *
 * 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 금지).
 */
import { useAgent, UseAgentUpdate } from '@copilotkit/react-core/v2';
import { useMemo } from 'react';
import { inferSkeletonVariant } from './inferSkeletonVariant';
import { SkeletonCard } from './SkeletonCard';
import { TypingIndicator } from './TypingIndicator';

/** agent.messages 항목의 최소 형태(읽는 필드만) — @ag-ui Message 의 부분집합. */
type ChatMessage = { role?: string; content?: string };

export function ChatLoadingOverlay({ agentId = 'batdi' }: { agentId?: string }) {
  // OnRunStatusChanged: isRunning 토글 시 / OnMessagesChanged: 첫 토큰 도착 감지용.
  const { agent } = useAgent({
    agentId,
    updates: [UseAgentUpdate.OnRunStatusChanged, UseAgentUpdate.OnMessagesChanged],
  });

  const messages = (agent?.messages ?? []) as ChatMessage[];
  const isRunning = agent?.isRunning ?? false;

  // 마지막 메시지: assistant 가 아직 토큰을 내지 않았으면(=user 가 마지막이거나
  //   assistant content 가 비어있음) "응답 시작 전" 으로 본다.
  const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const assistantStreaming =
    last?.role === 'assistant' && !!last.content && last.content.trim().length > 0;

  // 표시 조건: 실행 중 + 아직 어시스턴트 스트리밍이 시작되지 않음.
  const show = isRunning && !assistantStreaming;

  // variant 추정: 가장 최근 사용자 메시지 텍스트로.
  const variant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') {
        return inferSkeletonVariant(messages[i]?.content);
      }
    }
    return 'default' as const;
  }, [messages]);

  if (!show) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
      }}
    >
      <TypingIndicator />
      <SkeletonCard variant={variant} />
    </div>
  );
}
