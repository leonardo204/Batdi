'use client';

// 밧디 온보딩 — 응원 팀 선택 화면
// - 진입 시 GET /api/auth/me 로 인증 확인. 401 이면 /auth/login 으로 redirect.
// - 4팀(lotte/doosan/kia/hanwha) 그리드 선택. page.tsx 의 data-team + --team-accent 패턴 재활용.
//   선택 시 카드에 data-team 을 걸어 팀 악센트를 미리보기.
// - 완료 → POST /api/auth/onboarding { teamId, personaStyle } → /chat 이동
//   + document.documentElement.setAttribute('data-team', teamId) 로 전역 팀 악센트 반영.
// 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 금지).

import { BATDI_META } from '@batdi/ui';
import type { TeamId } from '@batdi/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// 선택 가능한 4팀 (백엔드 teamId enum 과 1:1)
const TEAMS: { id: TeamId; label: string }[] = [
  { id: 'lotte', label: '롯데 자이언츠' },
  { id: 'doosan', label: '두산 베어스' },
  { id: 'kia', label: '기아 타이거즈' },
  { id: 'hanwha', label: '한화 이글스' },
];

// 페르소나 스타일 — MVP 단순화(기본 passionate). 추후 선택 UI 확장 여지.
const DEFAULT_PERSONA_STYLE = 'passionate';

type AuthUser = { id: string; email: string };
type MeResponse = { user: AuthUser; onboarded: boolean };

export default function OnboardingPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<'checking' | 'ready'>('checking');
  const [selected, setSelected] = useState<TeamId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 진입 시 인증 확인 — 미인증(401)이면 로그인으로
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
        // 이미 온보딩 완료한 사용자는 채팅으로 바로 이동
        if (data.onboarded) {
          router.replace('/chat');
          return;
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

  async function handleComplete() {
    if (!selected) {
      setError('응원할 팀을 골라줘.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/onboarding', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: selected, personaStyle: DEFAULT_PERSONA_STYLE }),
      });
      if (!res.ok) {
        throw new Error(`온보딩 저장 실패 (${res.status})`);
      }
      // 전역 팀 악센트 반영 후 채팅으로 이동
      document.documentElement.setAttribute('data-team', selected);
      router.push('/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : '온보딩 저장 중 오류가 발생했어.');
      setSubmitting(false);
    }
  }

  // 인증 확인 중 — 로딩 표시
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
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-6)',
        padding: 'var(--space-6)',
        background: 'var(--color-bg)',
      }}
    >
      <header style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--fw-bold)', color: 'var(--color-text)' }}>
          어떤 팀을 응원해?
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          {BATDI_META.name}가 너의 팀에 맞춰 더 신나게 떠들어줄게.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 'var(--space-4)',
          width: '100%',
          maxWidth: '32rem',
        }}
      >
        {TEAMS.map((team) => {
          const isActive = selected === team.id;
          return (
            <button
              key={team.id}
              type="button"
              data-team={team.id}
              aria-pressed={isActive}
              onClick={() => setSelected(team.id)}
              disabled={submitting}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-2)',
                minHeight: '6rem',
                padding: 'var(--space-5)',
                background: isActive ? 'var(--color-surface-hover)' : 'var(--color-surface)',
                color: 'var(--color-text)',
                // 선택 시 팀 악센트 보더로 미리보기
                border: `2px solid ${isActive ? 'var(--team-accent)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-lg)',
                cursor: submitting ? 'default' : 'pointer',
                boxShadow: isActive ? 'var(--shadow-md)' : 'none',
                transition: 'border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 'var(--space-5)',
                  height: 'var(--space-5)',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--team-accent)',
                }}
              />
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--fw-semibold)' }}>{team.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)', margin: 0 }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleComplete}
        disabled={submitting || !selected}
        // 선택 시 해당 팀 악센트로 완료 버튼 강조
        data-team={selected ?? undefined}
        style={{
          width: '100%',
          maxWidth: '32rem',
          padding: 'var(--space-3) var(--space-4)',
          fontSize: 'var(--text-base)',
          fontWeight: 'var(--fw-semibold)',
          color: 'var(--color-bg)',
          background: selected ? 'var(--team-accent)' : 'var(--color-disabled-bg)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          cursor: submitting || !selected ? 'default' : 'pointer',
          opacity: submitting ? 0.6 : 1,
          transition: 'background var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out)',
        }}
      >
        {submitting ? '저장 중…' : '완료'}
      </button>
    </main>
  );
}
