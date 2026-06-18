'use client';

// 밧디 /my 공통 레이아웃 — 레벨/통계/대화 3탭 + 인증 가드.
// - 진입 시 GET /api/auth/me 로 인증 확인(chat/page.tsx 패턴 그대로).
//   401/!ok → /auth/login, onboarded=false → /onboarding.
// - user.teamId 로 전역 data-team 을 걸어 팀 악센트(--team-accent) 반영.
// - 상단 네비: /my/level · /my/stats · /my/conversations 링크(현재 경로 활성 강조).
// 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 금지).

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type AuthUser = { id: string; teamId?: string | null };
type MeResponse = { user: AuthUser; onboarded: boolean };

const TABS: { href: string; label: string }[] = [
  { href: '/my/level', label: '레벨' },
  { href: '/my/stats', label: '통계' },
  { href: '/my/conversations', label: '대화' },
];

export default function MyLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authState, setAuthState] = useState<'checking' | 'ready'>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (cancelled) return;
        if (res.status === 401 || !res.ok) {
          router.replace('/auth/login');
          return;
        }
        const data = (await res.json()) as MeResponse;
        if (!data.onboarded) {
          router.replace('/onboarding');
          return;
        }
        if (data.user.teamId) {
          document.documentElement.setAttribute('data-team', data.user.teamId);
        }
        setAuthState('ready');
      } catch {
        if (!cancelled) router.replace('/auth/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (authState === 'checking') {
    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-base)',
        }}
      >
        확인 중…
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
        }}
      >
        <Link
          href="/chat"
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-muted)',
            textDecoration: 'none',
          }}
        >
          ← 채팅으로
        </Link>
        <nav style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: active ? 'var(--fw-semibold)' : 'var(--fw-medium)',
                  color: active ? 'var(--color-bg)' : 'var(--color-text)',
                  background: active ? 'var(--team-accent)' : 'transparent',
                  border: `1px solid ${active ? 'var(--team-accent)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  transition:
                    'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <section
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '40rem',
          margin: '0 auto',
          padding: 'var(--space-6) var(--space-5)',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </section>
    </main>
  );
}
