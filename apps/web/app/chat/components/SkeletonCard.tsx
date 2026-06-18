'use client';

/**
 * SkeletonCard — A2UI 카드 자리표시(스켈레톤) (uiux §5.4 CLS 0).
 *
 * RunStarted 직후, intent 별 SkeletonCard 를 사전 렌더해 A2UIEnvelope 도착 시
 *   in-place swap 한다(레이아웃 점프 최소화 = CLS 0). 실제 A2UI 카드(점수/스탯/뉴스/
 *   일정)와 유사한 골격·높이를 갖도록 variant 로 구분한다.
 *
 * 규칙:
 * - 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 색상/간격 금지).
 * - shimmer 애니메이션은 prefers-reduced-motion 시 비활성(정적 표면 유지).
 * - 고정 높이/라인 수로 실제 카드와 근접 — swap 시 점프를 줄인다.
 * - 장식 요소이므로 aria-hidden="true"(로딩 알림은 TypingIndicator 가 담당).
 */

export type SkeletonVariant = 'score' | 'stats' | 'news' | 'schedule' | 'default';

/** variant 별 골격 사양: 라인 수 + 제목 바 폭 + 최소 높이(실제 카드 근사치). */
const VARIANT_SPEC: Record<SkeletonVariant, { lines: number; titleWidth: string; minHeight: string }> = {
  // 실시간 스코어: 팀/점수 2행 + 상태 1행
  score: { lines: 3, titleWidth: '40%', minHeight: '132px' },
  // 기본 스탯: 표 형태 다행
  stats: { lines: 5, titleWidth: '50%', minHeight: '188px' },
  // 뉴스: 헤드라인 리스트
  news: { lines: 4, titleWidth: '60%', minHeight: '160px' },
  // 경기 일정: 일자별 매치 다행
  schedule: { lines: 4, titleWidth: '45%', minHeight: '160px' },
  // 기본: intent 추정 불가 시
  default: { lines: 3, titleWidth: '55%', minHeight: '132px' },
};

export function SkeletonCard({ variant = 'default' }: { variant?: SkeletonVariant }) {
  const spec = VARIANT_SPEC[variant];

  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        minHeight: spec.minHeight,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* 제목 바 */}
      <div
        className="batdi-skel-block"
        style={{ width: spec.titleWidth, height: 'var(--text-lg)', borderRadius: 'var(--radius-sm)' }}
      />
      {/* 본문 라인 — 마지막 라인은 짧게(자연스러운 텍스트 블록 모사) */}
      {Array.from({ length: spec.lines }).map((_, i) => {
        const isLast = i === spec.lines - 1;
        return (
          <div
            key={i}
            className="batdi-skel-block"
            style={{
              width: isLast ? '70%' : '100%',
              height: 'var(--text-base)',
              borderRadius: 'var(--radius-sm)',
            }}
          />
        );
      })}

      <style>{`
        .batdi-skel-block {
          position: relative;
          overflow: hidden;
          background: var(--color-surface-hover);
        }
        .batdi-skel-block::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.06) 50%,
            transparent 100%
          );
          animation: batdiSkelShimmer 1.4s var(--ease-in-out) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .batdi-skel-block::after {
            animation: none;
            display: none;
          }
        }
        @keyframes batdiSkelShimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
