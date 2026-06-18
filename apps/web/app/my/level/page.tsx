'use client';

// /my/level — 내 레벨 정보. GET /api/users/me/level (JWT 쿠키).
// - 레벨명·XP·진척 bar(토큰 기반 div bar)·다음 레벨 조건·현재 해금·전체 레벨 히스토리.
// - 로딩/에러/401(→ /auth/login) 처리. 인증 가드는 상위 layout.tsx 가 담당.
// 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 금지).

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type LevelInfo = {
  level: number;
  levelName: string;
  xp: number;
  currentMinXp: number;
  nextLevelXp: number | null;
  progressPercent: number;
  unlocks: string;
  allLevels: { level: number; name: string; minXp: number; unlocks: string }[];
};

export default function MyLevelPage() {
  const router = useRouter();
  const [data, setData] = useState<LevelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/users/me/level', {
          credentials: 'include',
        });
        if (cancelled) return;
        if (res.status === 401) {
          router.replace('/auth/login');
          return;
        }
        if (!res.ok) throw new Error(`레벨 정보를 불러오지 못했어 (${res.status})`);
        setData((await res.json()) as LevelInfo);
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
        내 레벨
      </h1>

      {/* 현재 레벨 카드 */}
      <div
        style={{
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 'var(--fw-bold)', color: 'var(--team-accent)' }}>
            Lv{data.level}
          </span>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-text)' }}>
            {data.levelName}
          </span>
        </div>

        {/* 진척 bar (토큰 기반 div bar) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div
            style={{
              width: '100%',
              height: 'var(--space-3)',
              background: 'var(--color-surface-hover)',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${data.progressPercent}%`,
                height: '100%',
                background: 'var(--team-accent)',
                borderRadius: 'var(--radius-full)',
                transition: 'width var(--duration-normal) var(--ease-out)',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            <span>
              {data.nextLevelXp === null
                ? `${data.xp} XP (MAX)`
                : `${data.xp} / ${data.nextLevelXp} XP`}
            </span>
            <span>{data.progressPercent}%</span>
          </div>
        </div>

        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
          {data.nextLevelXp === null
            ? '최고 레벨에 도달했어! 🎉'
            : `다음 레벨까지 ${Math.max(0, data.nextLevelXp - data.xp)} XP 남았어.`}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>현재 해금</span>
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>{data.unlocks}</span>
        </div>
      </div>

      {/* 전체 레벨 히스토리 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-text)', margin: 0 }}>
          전체 레벨
        </h2>
        {data.allLevels.map((lv) => {
          const reached = data.level >= lv.level;
          const isCurrent = data.level === lv.level;
          return (
            <div
              key={lv.level}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: 'var(--space-4)',
                background: isCurrent ? 'var(--color-surface-hover)' : 'var(--color-surface)',
                border: `1px solid ${isCurrent ? 'var(--team-accent)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-md)',
                opacity: reached ? 1 : 0.55,
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-base)',
                  fontWeight: 'var(--fw-bold)',
                  color: reached ? 'var(--team-accent)' : 'var(--color-text-subtle)',
                  minWidth: 'var(--space-7)',
                }}
              >
                Lv{lv.level}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 }}>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-text)' }}>
                  {lv.name}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{lv.unlocks}</span>
              </div>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-subtle)' }}>{lv.minXp} XP</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
