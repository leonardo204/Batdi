'use client';

// /my/conversations — 내 대화 목록. GET /api/conversations (JWT 쿠키).
// - 제목(없으면 "대화 N")·요약 미리보기·날짜·메시지수. 빈 목록 시 안내.
// - jumpToConversation 이 ?c=<id> 로 진입하면 해당 항목 하이라이트(선택).
// - 로딩/에러/401(→ /auth/login) 처리. 인증 가드는 상위 layout.tsx 가 담당.
// 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 금지).

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type ConversationItem = {
  id: string;
  title: string | null;
  summary: string | null;
  updatedAt: string;
  messageCount: number;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function MyConversationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('c');
  const [items, setItems] = useState<ConversationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/conversations', {
          credentials: 'include',
        });
        if (cancelled) return;
        if (res.status === 401) {
          router.replace('/auth/login');
          return;
        }
        if (!res.ok) throw new Error(`대화 목록을 불러오지 못했어 (${res.status})`);
        setItems((await res.json()) as ConversationItem[]);
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

  if (!items) {
    return (
      <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)' }}>
        불러오는 중…
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--fw-bold)', color: 'var(--color-text)', margin: 0 }}>
        내 대화
      </h1>

      {items.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-7) var(--space-5)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 'var(--text-lg)', color: 'var(--color-text)' }}>아직 대화가 없어</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            채팅에서 밧디랑 야구 얘기를 시작해봐!
          </span>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {items.map((c, idx) => {
            const isHighlighted = highlightId === c.id;
            const title = c.title?.trim() || `대화 ${items.length - idx}`;
            return (
              <li
                key={c.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  background: isHighlighted ? 'var(--color-surface-hover)' : 'var(--color-surface)',
                  border: `1px solid ${isHighlighted ? 'var(--team-accent)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-5)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-text)' }}>
                    {title}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>
                    {formatDate(c.updatedAt)}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-muted)',
                    margin: 0,
                    lineHeight: 'var(--lh-normal)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {c.summary?.trim() || '요약이 아직 없어.'}
                </p>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                  메시지 {c.messageCount}개
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
