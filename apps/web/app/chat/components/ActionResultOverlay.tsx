'use client';

/**
 * ActionResultOverlay — showPlayerDetail / showTeamComparison 액션 결과 표시 패널.
 *
 * 배경: 두 액션은 백엔드 데이터를 fetch 해 반환하지만(LLM 후속용) 화면에 표시할 UI 가
 *   없었다. useBatdiActions 의 handler 가 fetch 결과를 받으면 onShowResult 콜백으로
 *   이 오버레이를 연다(chat/page.tsx 가 상태 소유 + 렌더).
 *
 * 규칙:
 * - 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 색상/간격 금지).
 * - 팀 악센트는 data-team 속성(--team-accent)으로 스위치. 팀 비교는 카드별 data-team.
 * - 403 레벨 잠금({locked, requiredLevel, levelName})은 "Lv{N}에서 해금돼요" 안내.
 *
 * 모달이지만 의존성 없이 div + role="dialog" 로 구현(라이브러리 추가 금지).
 */

/** 선수 상세 — GET /api/players/:id 응답(부분, 렌더에 쓰는 필드만). */
export interface PlayerDetailData {
  player: {
    id: number;
    name: string | null;
    teamId: string | null;
    position: string | null;
  };
  batting: Record<string, unknown> | null;
  pitching: Record<string, unknown> | null;
}

/** 팀 비교 단건 — GET /api/stats/compare 응답의 teamA/teamB. */
export interface TeamCompareData {
  team: string;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  gamesBehind: number;
}

/** 팀 비교 — GET /api/stats/compare 응답(부분). */
export interface TeamComparisonData {
  teamA: TeamCompareData | null;
  teamB: TeamCompareData | null;
}

/** 403 레벨 잠금 응답(가정 형태). */
export interface LockedData {
  locked: true;
  requiredLevel?: number;
  levelName?: string;
}

/** 오버레이에 띄울 결과 — 액션 종류별 discriminated union. */
export type ActionResult =
  | { type: 'player'; data: PlayerDetailData }
  | { type: 'comparison'; data: TeamComparisonData }
  | { type: 'locked'; data: LockedData };

interface ActionResultOverlayProps {
  result: ActionResult | null;
  onClose: () => void;
}

/** 한국어 팀명 매핑(표시용). 알 수 없으면 원문 유지. */
const TEAM_LABEL: Record<string, string> = {
  lotte: '롯데',
  doosan: '두산',
  kia: '기아',
  hanwha: '한화',
};

function teamLabel(teamId: string | null | undefined): string {
  if (!teamId) return '—';
  return TEAM_LABEL[teamId] ?? teamId;
}

/** Decimal 등 unknown 값을 안전하게 문자열로(없으면 '—'). */
function statText(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

export function ActionResultOverlay({ result, onClose }: ActionResultOverlayProps) {
  if (!result) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        background: 'rgba(0,0,0,0.5)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="액션 결과"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '34rem',
          maxHeight: '90dvh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          style={{
            alignSelf: 'flex-end',
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-xl)',
            lineHeight: 1,
            cursor: 'pointer',
            padding: 'var(--space-1)',
          }}
        >
          ✕
        </button>

        {result.type === 'locked' && <LockedView data={result.data} />}
        {result.type === 'player' && <PlayerView data={result.data} />}
        {result.type === 'comparison' && <ComparisonView data={result.data} />}
      </div>
    </div>
  );
}

/** 403 레벨 잠금 안내. */
function LockedView({ data }: { data: LockedData }) {
  const lv = data.requiredLevel;
  const name = data.levelName;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <span style={{ fontSize: 'var(--text-3xl)' }} aria-hidden>
        🔒
      </span>
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--fw-bold)',
          color: 'var(--color-text)',
        }}
      >
        {lv ? `Lv${lv}에서 해금돼요` : '아직 잠겨 있어요'}
      </h2>
      <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--color-text-muted)' }}>
        {name
          ? `${name} 단계가 되면 이 정보를 볼 수 있어. 더 대화하면서 레벨을 올려봐!`
          : '레벨을 더 올리면 이 정보를 볼 수 있어. 더 대화해보자!'}
      </p>
    </div>
  );
}

/** 선수 상세 — 프로필 + 시즌 타격/투구 스탯. */
function PlayerView({ data }: { data: PlayerDetailData }) {
  const { player, batting, pitching } = data;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* 프로필 헤더 */}
      <div data-team={player.teamId ?? undefined} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--team-accent)', fontWeight: 'var(--fw-semibold)' }}>
          {teamLabel(player.teamId)}
        </span>
        <h2 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 'var(--fw-bold)', color: 'var(--color-text)' }}>
          {player.name ?? '이름 미상'}
        </h2>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          {player.position ?? '포지션 미상'}
        </span>
      </div>

      {batting && (
        <StatGroup
          title="타격"
          rows={[
            ['타율', statText(batting.avg)],
            ['홈런', statText(batting.hr)],
            ['타점', statText(batting.rbi)],
            ['OPS', statText(batting.ops)],
            ['출루율', statText(batting.obp)],
            ['장타율', statText(batting.slg)],
          ]}
        />
      )}

      {pitching && (
        <StatGroup
          title="투구"
          rows={[
            ['ERA', statText(pitching.era)],
            ['WHIP', statText(pitching.whip)],
            ['탈삼진', statText(pitching.strikeouts)],
            ['경기', statText(pitching.games)],
            ['FIP', statText(pitching.fip)],
            ['WAR', statText(pitching.war)],
          ]}
        />
      )}

      {!batting && !pitching && (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          이번 시즌 기록이 아직 없어.
        </p>
      )}
    </div>
  );
}

/** 라벨/값 행 그룹 — 스탯 그리드. */
function StatGroup({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-text)' }}>
        {title}
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-2)',
        }}
      >
        {rows.map(([label, value]) => (
          <div
            key={label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
              padding: 'var(--space-3)',
              background: 'var(--color-surface-hover)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{label}</span>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-text)' }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 팀 비교 — 두 팀을 나란히. */
function ComparisonView({ data }: { data: TeamComparisonData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 'var(--fw-bold)', color: 'var(--color-text)' }}>
        팀 비교
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        <TeamCard team={data.teamA} />
        <TeamCard team={data.teamB} />
      </div>
    </div>
  );
}

function TeamCard({ team }: { team: TeamCompareData | null }) {
  if (!team) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'var(--space-8)',
          padding: 'var(--space-4)',
          background: 'var(--color-surface-hover)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
        }}
      >
        기록 없음
      </div>
    );
  }
  return (
    <div
      data-team={team.team}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        background: 'var(--color-surface-hover)',
        border: '1px solid var(--team-accent)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-bold)', color: 'var(--team-accent)' }}>
        {teamLabel(team.team)}
      </span>
      <Row label="순위" value={`${team.rank}위`} />
      <Row label="승률" value={statText(team.winRate)} />
      <Row label="승-패-무" value={`${team.wins}-${team.losses}-${team.draws}`} />
      <Row label="게임차" value={statText(team.gamesBehind)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--color-text)', fontWeight: 'var(--fw-medium)' }}>{value}</span>
    </div>
  );
}
