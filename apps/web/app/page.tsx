import { BATDI_META, TEAM_IDS } from '@batdi/ui';
import type { TeamId } from '@batdi/types';

// 워크스페이스 링크 데모: @batdi/types 의 도메인 타입 사용
const PRIORITY_TEAMS: { id: TeamId; label: string }[] = [
  { id: 'lotte', label: '롯데' },
  { id: 'doosan', label: '두산' },
  { id: 'kia', label: '기아' },
  { id: 'hanwha', label: '한화' },
];

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-5)',
        padding: 'var(--space-6)',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: 'var(--text-3xl)',
          fontWeight: 'var(--fw-bold)',
          color: 'var(--team-accent)',
        }}
      >
        {BATDI_META.name} <span style={{ color: 'var(--color-text-muted)' }}>({BATDI_META.nameEn})</span>
      </h1>

      <p style={{ fontSize: 'var(--text-xl)', color: 'var(--color-text)' }}>
        {BATDI_META.tagline}
      </p>

      <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', maxWidth: '36rem' }}>
        KBO 야구 전문 Agentic Chatbot. 우선 지원 팀:
      </p>

      <ul
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          listStyle: 'none',
          padding: 0,
        }}
      >
        {PRIORITY_TEAMS.map((team) => (
          <li
            key={team.id}
            data-team={team.id}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-surface)',
              border: '2px solid var(--team-accent)',
              color: 'var(--color-text)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--fw-medium)',
            }}
          >
            {team.label}
          </li>
        ))}
      </ul>

      <footer style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
        지원 팀 ID: {TEAM_IDS.join(' · ')}
      </footer>
    </main>
  );
}
