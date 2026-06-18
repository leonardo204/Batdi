'use client';

// /my/predictions — 경기 예측 현황 + 적중률 (ADR-054, Lv2 해금).
// - GET /api/predictions/me (JWT 쿠키) → 내 예측 목록 + 누적 적중률 카드.
// - 403 locked(Lv2 미만) → "Lv2에서 해금돼요" 안내.
// - 예측 입력: 경기키 + 홈/원정 승 버튼(최소 폼). POST /api/predictions.
//   (예정 경기 소스가 web 에 마땅찮아 MVP 는 경기키 직접 입력 + 현황/적중률 표시 위주.)
// 인증 가드는 상위 layout.tsx 가 담당. 시각 속성은 tokens.css CSS variable 만 사용.

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type Winner = 'home' | 'away';

type PredictionItem = {
  gameKey: string;
  predictedWinner: Winner;
  status: string;
  actualWinner?: Winner;
  correct?: boolean;
  matchup: string;
};

type PredictionStats = {
  total: number;
  finished: number;
  correct: number;
  accuracy: number | null;
};

type MyPredictions = {
  predictions: PredictionItem[];
  stats: PredictionStats;
};

export default function MyPredictionsPage() {
  const router = useRouter();
  const [data, setData] = useState<MyPredictions | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 예측 입력 폼 상태.
  const [gameKey, setGameKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/predictions/me', {
        credentials: 'include',
      });
      if (res.status === 401) {
        router.replace('/auth/login');
        return;
      }
      if (!res.ok) throw new Error(`예측 정보를 불러오지 못했어 (${res.status})`);
      setData((await res.json()) as MyPredictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했어.');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    async (predictedWinner: Winner) => {
      const key = gameKey.trim();
      if (!key) {
        setFormMsg('경기키를 입력해줘.');
        return;
      }
      setSubmitting(true);
      setFormMsg(null);
      try {
        const res = await fetch('/api/predictions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameKey: key, predictedWinner }),
        });
        if (res.status === 403) {
          setLocked(true);
          return;
        }
        if (res.status === 404) {
          setFormMsg('그 경기를 못 찾았어. 경기키를 확인해줘.');
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          setFormMsg(body?.message ?? `예측 저장 실패 (${res.status})`);
          return;
        }
        setFormMsg(`예측 저장됨: ${predictedWinner === 'home' ? '홈 승' : '원정 승'}`);
        setGameKey('');
        await load();
      } catch {
        setFormMsg('네트워크 오류가 발생했어.');
      } finally {
        setSubmitting(false);
      }
    },
    [gameKey, load],
  );

  if (locked) {
    return (
      <div
        role="status"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 'var(--text-2xl)' }}>🔒</span>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-bold)', color: 'var(--color-text)', margin: 0 }}>
          경기 예측은 Lv2에서 해금돼요
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
          내야석(Lv2)에 오르면 승부 예측과 적중률을 쓸 수 있어. 조금만 더 활동해줘!
        </p>
      </div>
    );
  }

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

  const { stats, predictions } = data;
  const accuracyLabel =
    stats.accuracy === null ? '—' : `${Math.round(stats.accuracy * 100)}%`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--fw-bold)', color: 'var(--color-text)', margin: 0 }}>
        경기 예측
      </h1>

      {/* 적중률 카드 */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <Metric label="적중률" value={accuracyLabel} accent />
        <Metric label="적중" value={`${stats.correct} / ${stats.finished}`} />
        <Metric label="전체 예측" value={`${stats.total}`} />
      </div>

      {/* 예측 입력 폼(최소) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-5)',
        }}
      >
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-text)' }}>
          예측하기
        </span>
        <input
          value={gameKey}
          onChange={(e) => setGameKey(e.target.value)}
          placeholder="경기키 (예: 20260618-doosan-lotte-0)"
          aria-label="경기키"
          style={{
            padding: 'var(--space-3)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
          }}
        />
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit('home')}
            style={predictBtnStyle}
          >
            홈 승
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit('away')}
            style={predictBtnStyle}
          >
            원정 승
          </button>
        </div>
        {formMsg && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
            {formMsg}
          </p>
        )}
      </div>

      {/* 예측 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-text)', margin: 0 }}>
          내 예측
        </h2>
        {predictions.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
            아직 예측이 없어. 위에서 첫 예측을 해봐!
          </p>
        ) : (
          predictions.map((p) => {
            const resultLabel =
              p.correct === undefined
                ? p.status === 'FINISHED'
                  ? '무승부'
                  : '진행 전'
                : p.correct
                  ? '적중'
                  : '빗나감';
            const resultColor =
              p.correct === undefined
                ? 'var(--color-text-subtle)'
                : p.correct
                  ? 'var(--color-success)'
                  : 'var(--color-danger)';
            return (
              <div
                key={p.gameKey}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-4)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-text)' }}>
                    {p.matchup}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    내 예측: {p.predictedWinner === 'home' ? '홈 승' : '원정 승'}
                    {p.actualWinner
                      ? ` · 결과: ${p.actualWinner === 'home' ? '홈 승' : '원정 승'}`
                      : ''}
                  </span>
                </div>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-semibold)', color: resultColor }}>
                  {resultLabel}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const predictBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: 'var(--space-3)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--fw-semibold)',
  color: 'var(--color-bg)',
  background: 'var(--team-accent)',
  border: '1px solid var(--team-accent)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
};

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>{label}</span>
      <span
        style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 'var(--fw-bold)',
          color: accent ? 'var(--team-accent)' : 'var(--color-text)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
