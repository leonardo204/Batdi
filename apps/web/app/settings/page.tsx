'use client';

// 밧디 /settings — 커스텀 페르소나 편집기 (P4-W10 10.5).
// - 진입 시 GET /api/auth/me 로 인증 확인(layout/onboarding 패턴).
//   401/!ok → /auth/login, onboarded=false → /onboarding.
//   user.teamId 로 전역 data-team → 팀 악센트(--team-accent) 반영.
// - 마운트 시 GET /api/users/me/persona 로 현재 페르소나 로드 → textarea(500자 maxLength
//   + 실시간 카운터). 저장 → POST /api/users/me/persona.
//   400 거부(가드레일/길이)는 reason 별 사용자 친화 문구로 표시.
// 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 금지).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const MAX_LEN = 500;

type AuthUser = { id: string; teamId?: string | null };
type MeResponse = { user: AuthUser; onboarded: boolean };
type PersonaResponse = { customPersona: string | null };

// 저장 거부 사유(reason) → 사용자 친화 문구. 백엔드 violationType 과 1:1.
const REJECT_MESSAGES: Record<string, string> = {
  too_long: '페르소나는 500자 이내로 작성해줘.',
  ilbe_expression: '부적절한 표현이 포함돼 저장할 수 없어요.',
  prompt_injection: '그런 요청은 저장할 수 없어요. 야구 친구로 남게 해줘!',
  profanity: '비속어가 포함돼 저장할 수 없어요.',
  insult: '비하 표현이 포함돼 저장할 수 없어요.',
  threat: '위협적인 표현이 포함돼 저장할 수 없어요.',
  gambling: '도박 관련 표현은 저장할 수 없어요.',
  self_harm: '저장할 수 없는 표현이 포함돼 있어요.',
};

function rejectMessage(reason: string | undefined): string {
  return (reason && REJECT_MESSAGES[reason]) ?? '저장할 수 없는 내용이에요.';
}

export default function SettingsPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<'checking' | 'ready'>('checking');
  const [persona, setPersona] = useState('');
  const [loadingPersona, setLoadingPersona] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // 진입 시 인증 + 온보딩 확인, 통과 시 페르소나 로드.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        if (cancelled) return;
        if (meRes.status === 401 || !meRes.ok) {
          router.replace('/auth/login');
          return;
        }
        const me = (await meRes.json()) as MeResponse;
        if (!me.onboarded) {
          router.replace('/onboarding');
          return;
        }
        if (me.user.teamId) {
          document.documentElement.setAttribute('data-team', me.user.teamId);
        }
        setAuthState('ready');

        const personaRes = await fetch('/api/users/me/persona', {
          credentials: 'include',
        });
        if (cancelled) return;
        if (personaRes.ok) {
          const data = (await personaRes.json()) as PersonaResponse;
          setPersona(data.customPersona ?? '');
        }
        setLoadingPersona(false);
      } catch {
        if (!cancelled) router.replace('/auth/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch('/api/users/me/persona', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPersona: persona }),
      });
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as {
          reason?: string;
        };
        setError(rejectMessage(body.reason));
        return;
      }
      if (res.status === 401) {
        router.replace('/auth/login');
        return;
      }
      if (!res.ok) {
        throw new Error(`저장에 실패했어 (${res.status})`);
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했어.');
    } finally {
      setSaving(false);
    }
  }

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

  const overLimit = persona.trim().length > MAX_LEN;

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
        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--fw-semibold)',
            color: 'var(--color-text)',
          }}
        >
          설정
        </span>
      </header>

      <section
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '40rem',
          margin: '0 auto',
          padding: 'var(--space-6) var(--space-5)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <h1
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--fw-bold)',
              color: 'var(--color-text)',
              margin: 0,
            }}
          >
            나만의 밧디 만들기
          </h1>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-muted)',
              margin: 0,
            }}
          >
            밧디가 너에게 맞춰 말하도록 페르소나를 적어줘. (예: &quot;항상 반말로 친근하게&quot;)
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <textarea
            value={persona}
            disabled={loadingPersona || saving}
            maxLength={MAX_LEN}
            onChange={(e) => {
              setPersona(e.target.value);
              setSaved(false);
              setError(null);
            }}
            placeholder={
              loadingPersona ? '불러오는 중…' : '밧디가 어떻게 말했으면 좋겠어?'
            }
            rows={6}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              padding: 'var(--space-4)',
              fontSize: 'var(--text-base)',
              lineHeight: 'var(--lh-relaxed)',
              color: 'var(--color-text)',
              background: 'var(--color-surface)',
              border: `1px solid ${overLimit ? 'var(--color-danger)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-lg)',
              outline: 'none',
            }}
          />
          <span
            style={{
              alignSelf: 'flex-end',
              fontSize: 'var(--text-xs)',
              color: overLimit ? 'var(--color-danger)' : 'var(--color-text-subtle)',
            }}
          >
            {persona.trim().length}/{MAX_LEN}
          </span>
        </div>

        {error && (
          <p
            role="alert"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)', margin: 0 }}
          >
            {error}
          </p>
        )}
        {saved && (
          <p
            role="status"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--team-accent)', margin: 0 }}
          >
            저장됐어!
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loadingPersona || overLimit}
          style={{
            alignSelf: 'flex-start',
            padding: 'var(--space-3) var(--space-6)',
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--fw-semibold)',
            color: 'var(--color-bg)',
            background: 'var(--team-accent)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: saving || loadingPersona || overLimit ? 'not-allowed' : 'pointer',
            opacity: saving || loadingPersona || overLimit ? 0.6 : 1,
            transition: 'opacity var(--duration-fast) var(--ease-out)',
          }}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </section>
    </main>
  );
}
