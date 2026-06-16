'use client';

// 밧디 로그인 / 시작하기 화면
// - 이메일 입력 → POST /api/auth/login (same-origin 프록시 → api:3001/auth/login)
// - JWT 는 HttpOnly 쿠키(batdi_token)로 set 되므로 credentials:'include' 필수.
// - 응답 user.settings.onboarded 분기: true → /chat, false → /onboarding
// - 개발 편의: mock 로그인 버튼(POST /api/auth/dev/mock-login) 동일 분기.
// 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 금지). 다크 테마 기본.

import { BATDI_META } from '@batdi/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// 백엔드 user 객체(부분) — 분기에 필요한 필드만 사용
type AuthUser = {
  id: string;
  email: string;
  settings?: { onboarded?: boolean } | null;
};
type LoginResponse = { user: AuthUser };

// 간단 이메일 형식 검증
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 로그인 응답 user 의 onboarded 여부로 다음 경로 분기
  function routeByOnboarded(user: AuthUser) {
    if (user.settings?.onboarded) {
      router.push('/chat');
    } else {
      router.push('/onboarding');
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('올바른 이메일 형식을 입력해줘.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include', // HttpOnly 쿠키 수신 필수
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        throw new Error(`로그인 실패 (${res.status})`);
      }
      const data = (await res.json()) as LoginResponse;
      routeByOnboarded(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 중 오류가 발생했어.');
      setLoading(false);
    }
  }

  // 개발용 mock 로그인 — 이메일 입력 없이 인증 + 동일 분기
  async function handleMockLogin() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/dev/mock-login', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`mock 로그인 실패 (${res.status})`);
      }
      const data = (await res.json()) as LoginResponse;
      routeByOnboarded(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'mock 로그인 중 오류가 발생했어.');
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-6)',
        padding: 'var(--space-6)',
        background: 'var(--color-bg)',
      }}
    >
      <header style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h1
          style={{
            fontSize: 'var(--text-3xl)',
            fontWeight: 'var(--fw-bold)',
            color: 'var(--team-accent)',
          }}
        >
          {BATDI_META.name}
        </h1>
        <p style={{ fontSize: 'var(--text-lg)', color: 'var(--color-text)' }}>{BATDI_META.tagline}</p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          이메일로 시작해봐. 처음이면 팀 선택부터 도와줄게.
        </p>
      </header>

      <form
        onSubmit={handleLogin}
        style={{
          width: '100%',
          maxWidth: '24rem',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <label
          htmlFor="email"
          style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-medium)', color: 'var(--color-text)' }}
        >
          이메일
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: 'var(--space-3) var(--space-4)',
            fontSize: 'var(--text-base)',
            color: 'var(--color-text)',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            outlineColor: 'var(--color-focus-ring)',
          }}
        />

        {error && (
          <p role="alert" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)', margin: 0 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: 'var(--space-3) var(--space-4)',
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--fw-semibold)',
            color: 'var(--color-bg)',
            background: 'var(--team-accent)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'opacity var(--duration-fast) var(--ease-out)',
          }}
        >
          {loading ? '진행 중…' : '로그인 / 시작하기'}
        </button>

        <button
          type="button"
          onClick={handleMockLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--fw-medium)',
            color: 'var(--color-text-muted)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          개발용 mock 로그인
        </button>
      </form>
    </main>
  );
}
