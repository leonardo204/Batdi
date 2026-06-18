'use client';

// /my/conversations — 내 대화 목록 + 검색·삭제 (platform-ops §12.3).
// - GET /api/conversations[?q=] (JWT 쿠키) 로 목록·검색 조회.
// - 검색창: 입력 디바운스(300ms) → ?q= 재조회. 빈 결과 안내.
// - 삭제: 항목별 삭제 버튼 → window.confirm → DELETE /api/conversations/:id → 목록 갱신.
// - 제목(없으면 "대화 N")·요약 미리보기·날짜·메시지수.
// - jumpToConversation 이 ?c=<id> 로 진입하면 해당 항목 하이라이트(선택).
// - 로딩/에러/401(→ /auth/login) 처리. 인증 가드는 상위 layout.tsx 가 담당.
// 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 금지).

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

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
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 목록/검색 조회 — q 가 있으면 ?q= 부착. 401 → 로그인.
  const fetchItems = useCallback(
    async (q: string, signal?: AbortSignal): Promise<void> => {
      try {
        const url = q.trim()
          ? `/api/conversations?q=${encodeURIComponent(q.trim())}`
          : '/api/conversations';
        const res = await fetch(url, { credentials: 'include', signal });
        if (signal?.aborted) return;
        if (res.status === 401) {
          router.replace('/auth/login');
          return;
        }
        if (!res.ok)
          throw new Error(`대화 목록을 불러오지 못했어 (${res.status})`);
        setError(null);
        setItems((await res.json()) as ConversationItem[]);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : '오류가 발생했어.');
      }
    },
    [router],
  );

  // 검색어 디바운스(300ms) → 재조회.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchItems(query, controller.signal);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, fetchItems]);

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm('이 대화를 삭제할까? 되돌릴 수 없어.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.status === 401) {
        router.replace('/auth/login');
        return;
      }
      if (!res.ok) throw new Error(`삭제하지 못했어 (${res.status})`);
      setItems((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 중 오류가 발생했어.');
    } finally {
      setDeletingId(null);
    }
  }

  const trimmedQuery = query.trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--fw-bold)', color: 'var(--color-text)', margin: 0 }}>
        내 대화
      </h1>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="대화 검색 (제목·요약·메시지)"
        aria-label="대화 검색"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: 'var(--space-3) var(--space-4)',
          fontSize: 'var(--text-base)',
          color: 'var(--color-text)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          outline: 'none',
        }}
      />

      {error && (
        <p role="alert" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)', margin: 0 }}>
          {error}
        </p>
      )}

      {items === null ? (
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: 0 }}>
          불러오는 중…
        </p>
      ) : items.length === 0 ? (
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
          {trimmedQuery ? (
            <>
              <span style={{ fontSize: 'var(--text-lg)', color: 'var(--color-text)' }}>
                검색 결과가 없어
              </span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                다른 키워드로 다시 찾아봐!
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 'var(--text-lg)', color: 'var(--color-text)' }}>아직 대화가 없어</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                채팅에서 밧디랑 야구 얘기를 시작해봐!
              </span>
            </>
          )}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                    메시지 {c.messageCount}개
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    aria-label={`${title} 삭제`}
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 'var(--fw-medium)',
                      color: 'var(--color-danger)',
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-1) var(--space-3)',
                      cursor: deletingId === c.id ? 'default' : 'pointer',
                      opacity: deletingId === c.id ? 0.5 : 1,
                      transition: 'opacity var(--duration-fast) var(--ease-out)',
                    }}
                  >
                    {deletingId === c.id ? '삭제 중…' : '삭제'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
