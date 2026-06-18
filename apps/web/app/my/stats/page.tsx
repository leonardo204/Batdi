'use client';

// /my/stats — 내 활동 통계. GET /api/users/me/stats (JWT 쿠키).
// - 대화수/메시지수/턴/관심선수수/레벨 카드 그리드.
// - 로딩/에러/401(→ /auth/login) 처리. 인증 가드는 상위 layout.tsx 가 담당.
// 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 금지).

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type UserStats = {
  conversationCount: number;
  messageCount: number;
  turns: number;
  favoriteCount: number;
  level: number;
  xp: number;
};

const CARDS: { key: keyof UserStats; label: string; suffix?: string }[] = [
  { key: 'conversationCount', label: '대화 수', suffix: '개' },
  { key: 'messageCount', label: '메시지 수', suffix: '개' },
  { key: 'turns', label: '주고받은 턴', suffix: '턴' },
  { key: 'favoriteCount', label: '관심 선수', suffix: '명' },
  { key: 'level', label: '레벨', suffix: '' },
  { key: 'xp', label: '누적 XP', suffix: 'XP' },
];

export default function MyStatsPage() {
  const router = useRouter();
  const [data, setData] = useState<UserStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/users/me/stats', {
          credentials: 'include',
        });
        if (cancelled) return;
        if (res.status === 401) {
          router.replace('/auth/login');
          return;
        }
        if (!res.ok) throw new Error(`통계를 불러오지 못했어 (${res.status})`);
        setData((await res.json()) as UserStats);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '오류가 발생했어.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <p role="alert" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)' }}>
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)' }}>
        불러오는 중…
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--fw-bold)', color: 'var(--color-text)', margin: 0 }}>
        내 통계
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {CARDS.map((card) => (
          <div
            key={card.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{card.label}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--fw-bold)', color: 'var(--team-accent)' }}>
                {data[card.key]}
              </span>
              {card.suffix && (
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-subtle)' }}>{card.suffix}</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', margin: 0 }}>
        예측 적중률·연속 활동일은 준비 중이야.
      </p>
    </div>
  );
}
