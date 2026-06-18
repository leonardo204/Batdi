'use client';

/**
 * TypingIndicator — "밧디가 입력 중…" 3-dot 펄스 인디케이터 (uiux §5.4 CLS 0).
 *
 * RunStarted(=agent.isRunning) 직후, 어시스턴트 응답이 스트리밍되기 전까지
 *   채팅 하단에 노출해 "응답 생성 중" 상태를 즉시 알린다(CLS 0 — 자리표시).
 *
 * 규칙:
 * - 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 색상/간격 금지).
 * - prefers-reduced-motion 존중: 모션 비활성 시 점은 정적(투명도만 약하게 고정).
 * - 접근성: aria-live="polite" + role="status" 로 스크린리더에 "밧디가 답변을 준비 중"
 *   을 1회 알린다(상위에서 마운트/언마운트로 등장/소멸).
 *
 * 애니메이션은 styled-jsx 가 아닌 인라인 <style> + keyframes 로 정의(라이브러리 추가 금지).
 *   keyframes 이름은 충돌 회피 위해 batdi 접두.
 */
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="밧디가 답변을 준비 중"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        color: 'var(--color-text-muted)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
        <span className="batdi-typing-dot" />
        <span className="batdi-typing-dot" style={{ animationDelay: '160ms' }} />
        <span className="batdi-typing-dot" style={{ animationDelay: '320ms' }} />
      </span>
      <span>밧디가 입력 중…</span>

      <style>{`
        .batdi-typing-dot {
          width: 6px;
          height: 6px;
          border-radius: var(--radius-full);
          background: var(--team-accent);
          opacity: 0.4;
          animation: batdiTypingBounce 1.2s var(--ease-in-out) infinite;
        }
        @keyframes batdiTypingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .batdi-typing-dot {
            animation: none;
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  );
}
