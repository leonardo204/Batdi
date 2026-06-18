'use client';

// 밧디 /settings — 설정 페이지 (P4-W10 10.5 + platform-ops §12.3).
// - 진입 시 GET /api/auth/me 로 인증 확인(layout/onboarding 패턴).
//   401/!ok → /auth/login, onboarded=false → /onboarding.
//   user.teamId 로 전역 data-team → 팀 악센트(--team-accent) 반영.
// - 마운트 시 GET /api/users/me/persona(현 페르소나)·GET /api/users/me/level(레벨 게이팅)
//   을 병렬 로드. me 응답의 settings/teamId/displayName 으로 각 섹션 초기값 세팅.
// 섹션(§12.3): 커스텀 페르소나 / 팀 변경 / 알림 설정 / 데이터 보존기간 /
//   개인화 학습 동의 / 커스텀 닉네임(Lv5 해금).
// 시각 속성은 tokens.css CSS variable 만 사용(하드코딩 금지). credentials:'include'.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  getSubscriptionState,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  type SubscribeResult,
} from '../../lib/push';

const MAX_LEN = 500;
const NICKNAME_MAX_LEN = 20;
/** 커스텀 닉네임 해금 레벨(ADR-053). */
const NICKNAME_UNLOCK_LEVEL = 5;

/** MVP 우선 지원 팀(백엔드 VALID_TEAMS 와 일치). */
const TEAMS: { id: string; label: string }[] = [
  { id: 'lotte', label: '롯데 자이언츠' },
  { id: 'doosan', label: '두산 베어스' },
  { id: 'kia', label: '기아 타이거즈' },
  { id: 'hanwha', label: '한화 이글스' },
];

/** 알림 토글 정의 — 키는 백엔드 settings.notifications 맵 키. */
const NOTIFICATION_OPTIONS: { key: string; label: string }[] = [
  { key: 'gameStart', label: '경기 시작 알림' },
  { key: 'gameEnd', label: '경기 종료 알림' },
  { key: 'favoritePlayer', label: '관심 선수 소식' },
  { key: 'levelUp', label: '레벨업 알림' },
];

/** 데이터 보존기간 옵션(일) — 백엔드 화이트리스트와 일치. */
const RETENTION_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: '30일' },
  { value: 90, label: '90일' },
  { value: 180, label: '180일' },
  { value: 365, label: '365일' },
];

type AuthUser = {
  id: string;
  teamId?: string | null;
  displayName?: string | null;
  settings?: UserSettings | null;
};
type UserSettings = {
  notifications?: Record<string, boolean>;
  dataRetentionDays?: number;
  learningConsent?: boolean;
  [key: string]: unknown;
};
type MeResponse = { user: AuthUser; onboarded: boolean };
type PersonaResponse = { customPersona: string | null };
type LevelResponse = { level: number };

// 페르소나 저장 거부 사유(reason) → 사용자 친화 문구. 백엔드 violationType 과 1:1.
const REJECT_MESSAGES: Record<string, string> = {
  too_long: '페르소나는 500자 이내로 작성해줘.',
  invalid_length: '1~20자로 작성해줘.',
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

/** 섹션 공통 상태 — 저장중/성공/에러. */
type SaveState = { saving: boolean; saved: boolean; error: string | null };
const IDLE: SaveState = { saving: false, saved: false, error: null };

export default function SettingsPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<'checking' | 'ready'>('checking');

  // 커스텀 페르소나.
  const [persona, setPersona] = useState('');
  const [loadingPersona, setLoadingPersona] = useState(true);
  const [personaState, setPersonaState] = useState<SaveState>(IDLE);

  // 팀 변경.
  const [teamId, setTeamId] = useState('');
  const [teamState, setTeamState] = useState<SaveState>(IDLE);

  // 알림 설정.
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});
  const [notifState, setNotifState] = useState<SaveState>(IDLE);

  // 브라우저 푸시 구독(P4-W11) — 서버 settings 와 별개의 디바이스 단위 구독.
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  // 데이터 보존기간.
  const [retentionDays, setRetentionDays] = useState<number>(90);
  const [retentionState, setRetentionState] = useState<SaveState>(IDLE);

  // 개인화 학습 동의.
  const [learningConsent, setLearningConsent] = useState(false);
  const [consentState, setConsentState] = useState<SaveState>(IDLE);

  // 커스텀 닉네임(Lv5 해금).
  const [nickname, setNickname] = useState('');
  const [level, setLevel] = useState(1);
  const [nicknameState, setNicknameState] = useState<SaveState>(IDLE);

  // 진입 시 인증 + 온보딩 확인 → 페르소나/레벨 병렬 로드 + settings 초기화.
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
          setTeamId(me.user.teamId);
        }
        if (me.user.displayName) setNickname(me.user.displayName);
        const s = me.user.settings ?? {};
        setNotifications(s.notifications ?? {});
        if (typeof s.dataRetentionDays === 'number') {
          setRetentionDays(s.dataRetentionDays);
        }
        setLearningConsent(s.learningConsent === true);
        setAuthState('ready');

        const [personaRes, levelRes] = await Promise.all([
          fetch('/api/users/me/persona', { credentials: 'include' }),
          fetch('/api/users/me/level', { credentials: 'include' }),
        ]);
        if (cancelled) return;
        if (personaRes.ok) {
          const data = (await personaRes.json()) as PersonaResponse;
          setPersona(data.customPersona ?? '');
        }
        if (levelRes.ok) {
          const data = (await levelRes.json()) as LevelResponse;
          setLevel(data.level ?? 1);
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

  // 브라우저 푸시 지원/구독 여부 초기 감지(디바이스 단위, 인증과 무관).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = isPushSupported();
      if (cancelled) return;
      setPushSupported(supported);
      if (supported) {
        const subscribed = await getSubscriptionState();
        if (!cancelled) setPushSubscribed(subscribed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 브라우저 알림 켜기/끄기 토글.
  async function handleTogglePush() {
    setPushBusy(true);
    setPushNotice(null);
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush();
        setPushSubscribed(false);
        setPushNotice('브라우저 알림을 껐어.');
        return;
      }
      const result: SubscribeResult = await subscribeToPush();
      switch (result.status) {
        case 'subscribed':
          setPushSubscribed(true);
          setPushNotice('브라우저 알림을 켰어!');
          break;
        case 'unsupported':
          setPushNotice('이 브라우저는 알림을 지원하지 않아.');
          break;
        case 'denied':
          setPushNotice('브라우저 알림 권한이 거부됐어. 브라우저 설정에서 허용해줘.');
          break;
        case 'disabled':
          setPushNotice('서버 푸시가 아직 설정되지 않았어.');
          break;
        case 'error':
          setPushNotice(`알림 설정 중 오류가 났어 (${result.message})`);
          break;
      }
    } finally {
      setPushBusy(false);
    }
  }

  // --- 커스텀 페르소나 저장 ---
  async function handleSavePersona() {
    setPersonaState({ saving: true, saved: false, error: null });
    try {
      const res = await fetch('/api/users/me/persona', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPersona: persona }),
      });
      if (res.status === 401) {
        router.replace('/auth/login');
        return;
      }
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as { reason?: string };
        setPersonaState({ saving: false, saved: false, error: rejectMessage(body.reason) });
        return;
      }
      if (!res.ok) throw new Error(`저장에 실패했어 (${res.status})`);
      setPersonaState({ saving: false, saved: true, error: null });
    } catch (err) {
      setPersonaState({
        saving: false,
        saved: false,
        error: err instanceof Error ? err.message : '오류가 발생했어.',
      });
    }
  }

  // --- 팀 변경 ---
  async function handleSaveTeam(next: string) {
    setTeamId(next);
    setTeamState({ saving: true, saved: false, error: null });
    try {
      const res = await fetch('/api/users/me/team', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: next }),
      });
      if (res.status === 401) {
        router.replace('/auth/login');
        return;
      }
      if (!res.ok) throw new Error(`저장에 실패했어 (${res.status})`);
      document.documentElement.setAttribute('data-team', next);
      setTeamState({ saving: false, saved: true, error: null });
    } catch (err) {
      setTeamState({
        saving: false,
        saved: false,
        error: err instanceof Error ? err.message : '오류가 발생했어.',
      });
    }
  }

  // --- settings PATCH 공통(알림/보존기간/학습동의) ---
  async function patchSettings(
    payload: Partial<UserSettings>,
    setState: (s: SaveState) => void,
  ): Promise<boolean> {
    setState({ saving: true, saved: false, error: null });
    try {
      const res = await fetch('/api/users/me/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        router.replace('/auth/login');
        return false;
      }
      if (!res.ok) throw new Error(`저장에 실패했어 (${res.status})`);
      setState({ saving: false, saved: true, error: null });
      return true;
    } catch (err) {
      setState({
        saving: false,
        saved: false,
        error: err instanceof Error ? err.message : '오류가 발생했어.',
      });
      return false;
    }
  }

  async function handleToggleNotification(key: string) {
    const value = !notifications[key];
    setNotifications((prev) => ({ ...prev, [key]: value }));
    await patchSettings({ notifications: { [key]: value } }, setNotifState);
  }

  async function handleSaveRetention(days: number) {
    setRetentionDays(days);
    await patchSettings({ dataRetentionDays: days }, setRetentionState);
  }

  async function handleToggleConsent() {
    const next = !learningConsent;
    setLearningConsent(next);
    await patchSettings({ learningConsent: next }, setConsentState);
  }

  // --- 커스텀 닉네임(Lv5) ---
  async function handleSaveNickname() {
    setNicknameState({ saving: true, saved: false, error: null });
    try {
      const res = await fetch('/api/users/me/nickname', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
      });
      if (res.status === 401) {
        router.replace('/auth/login');
        return;
      }
      if (res.status === 403) {
        setNicknameState({
          saving: false,
          saved: false,
          error: `Lv${NICKNAME_UNLOCK_LEVEL}에서 해금돼요.`,
        });
        return;
      }
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as { reason?: string };
        setNicknameState({ saving: false, saved: false, error: rejectMessage(body.reason) });
        return;
      }
      if (!res.ok) throw new Error(`저장에 실패했어 (${res.status})`);
      setNicknameState({ saving: false, saved: true, error: null });
    } catch (err) {
      setNicknameState({
        saving: false,
        saved: false,
        error: err instanceof Error ? err.message : '오류가 발생했어.',
      });
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
  const nicknameLocked = level < NICKNAME_UNLOCK_LEVEL;

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
          gap: 'var(--space-6)',
        }}
      >
        {/* === 커스텀 페르소나 === */}
        <SettingsCard
          title="나만의 밧디 만들기"
          desc='밧디가 너에게 맞춰 말하도록 페르소나를 적어줘. (예: "항상 반말로 친근하게")'
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <textarea
              value={persona}
              disabled={loadingPersona || personaState.saving}
              maxLength={MAX_LEN}
              onChange={(e) => {
                setPersona(e.target.value);
                setPersonaState(IDLE);
              }}
              placeholder={loadingPersona ? '불러오는 중…' : '밧디가 어떻게 말했으면 좋겠어?'}
              rows={6}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                padding: 'var(--space-4)',
                fontSize: 'var(--text-base)',
                lineHeight: 'var(--lh-relaxed)',
                color: 'var(--color-text)',
                background: 'var(--color-bg)',
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
          <SectionFeedback state={personaState} />
          <PrimaryButton
            label={personaState.saving ? '저장 중…' : '저장'}
            disabled={personaState.saving || loadingPersona || overLimit}
            onClick={handleSavePersona}
          />
        </SettingsCard>

        {/* === 팀 변경 === */}
        <SettingsCard title="응원팀" desc="응원하는 팀을 바꾸면 밧디의 색과 말투가 달라져.">
          <select
            value={teamId}
            disabled={teamState.saving}
            onChange={(e) => handleSaveTeam(e.target.value)}
            style={selectStyle}
            aria-label="응원팀 선택"
          >
            {TEAMS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <SectionFeedback state={teamState} />
        </SettingsCard>

        {/* === 알림 설정 === */}
        <SettingsCard title="알림 설정" desc="받고 싶은 알림만 켜둬.">
          {/* 브라우저 푸시 구독(디바이스 단위) — 켜야 아래 알림 종류가 실제로 도착해. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <ToggleRow
              label="브라우저 알림 켜기"
              checked={pushSubscribed}
              disabled={!pushSupported || pushBusy}
              onToggle={handleTogglePush}
            />
            {!pushSupported && (
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-subtle)',
                  margin: 0,
                }}
              >
                이 브라우저는 알림을 지원하지 않아.
              </p>
            )}
            {pushNotice && (
              <p
                role="status"
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-muted)',
                  margin: 0,
                }}
              >
                {pushNotice}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {NOTIFICATION_OPTIONS.map((opt) => (
              <ToggleRow
                key={opt.key}
                label={opt.label}
                checked={notifications[opt.key] === true}
                disabled={notifState.saving}
                onToggle={() => handleToggleNotification(opt.key)}
              />
            ))}
          </div>
          <SectionFeedback state={notifState} />
        </SettingsCard>

        {/* === 데이터 보존기간 === */}
        <SettingsCard
          title="대화 보존기간"
          desc="설정한 기간이 지난 대화는 자동으로 정리돼."
        >
          <select
            value={retentionDays}
            disabled={retentionState.saving}
            onChange={(e) => handleSaveRetention(Number(e.target.value))}
            style={selectStyle}
            aria-label="대화 보존기간 선택"
          >
            {RETENTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <SectionFeedback state={retentionState} />
        </SettingsCard>

        {/* === 개인화 학습 동의 === */}
        <SettingsCard
          title="개인화 학습"
          desc="대화를 바탕으로 밧디가 너의 취향을 학습하도록 허용할지 선택해."
        >
          <ToggleRow
            label="개인화 학습 허용"
            checked={learningConsent}
            disabled={consentState.saving}
            onToggle={handleToggleConsent}
          />
          <SectionFeedback state={consentState} />
        </SettingsCard>

        {/* === 커스텀 닉네임(Lv5 해금) === */}
        <SettingsCard
          title="커스텀 닉네임"
          desc={
            nicknameLocked
              ? `Lv${NICKNAME_UNLOCK_LEVEL}에서 해금돼요.`
              : '밧디가 너를 부를 이름을 정해줘.'
          }
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              value={nickname}
              disabled={nicknameLocked || nicknameState.saving}
              maxLength={NICKNAME_MAX_LEN}
              onChange={(e) => {
                setNickname(e.target.value);
                setNicknameState(IDLE);
              }}
              placeholder={nicknameLocked ? `Lv${NICKNAME_UNLOCK_LEVEL}에서 해금돼요` : '닉네임'}
              aria-label="커스텀 닉네임"
              style={{
                flex: 1,
                boxSizing: 'border-box',
                padding: 'var(--space-3) var(--space-4)',
                fontSize: 'var(--text-base)',
                color: nicknameLocked ? 'var(--color-disabled-text)' : 'var(--color-text)',
                background: nicknameLocked ? 'var(--color-disabled-bg)' : 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                outline: 'none',
              }}
            />
            <PrimaryButton
              label={nicknameState.saving ? '저장 중…' : '저장'}
              disabled={nicknameLocked || nicknameState.saving || nickname.trim().length === 0}
              onClick={handleSaveNickname}
            />
          </div>
          <SectionFeedback state={nicknameState} />
        </SettingsCard>
      </section>
    </main>
  );
}

/** 공용 셀렉트 스타일(tokens 만). */
const selectStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 'var(--space-3) var(--space-4)',
  fontSize: 'var(--text-base)',
  color: 'var(--color-text)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  outline: 'none',
};

/** 섹션 카드 — 제목/설명 + children. */
function SettingsCard(props: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        padding: 'var(--space-5)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <h2
          style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 'var(--fw-semibold)',
            color: 'var(--color-text)',
            margin: 0,
          }}
        >
          {props.title}
        </h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
          {props.desc}
        </p>
      </div>
      {props.children}
    </div>
  );
}

/** 저장 성공/에러 피드백. */
function SectionFeedback({ state }: { state: SaveState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)', margin: 0 }}
      >
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p
        role="status"
        style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)', margin: 0 }}
      >
        저장됐어!
      </p>
    );
  }
  return null;
}

/** 토글 행 — 라벨 + on/off 스위치(접근성: role=switch). */
function ToggleRow(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
      }}
    >
      <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>
        {props.label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onToggle}
        style={{
          position: 'relative',
          width: '2.75rem',
          height: '1.5rem',
          flexShrink: 0,
          padding: 0,
          border: 'none',
          borderRadius: 'var(--radius-full)',
          background: props.checked ? 'var(--team-accent)' : 'var(--color-border)',
          cursor: props.disabled ? 'not-allowed' : 'pointer',
          opacity: props.disabled ? 0.6 : 1,
          transition: 'background var(--duration-fast) var(--ease-out)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '0.1875rem',
            left: props.checked ? '1.375rem' : '0.1875rem',
            width: '1.125rem',
            height: '1.125rem',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-bg)',
            transition: 'left var(--duration-fast) var(--ease-out)',
          }}
        />
      </button>
    </div>
  );
}

/** 팀 악센트 기본 버튼. */
function PrimaryButton(props: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      style={{
        alignSelf: 'flex-start',
        padding: 'var(--space-3) var(--space-6)',
        fontSize: 'var(--text-base)',
        fontWeight: 'var(--fw-semibold)',
        color: 'var(--color-bg)',
        background: 'var(--team-accent)',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.6 : 1,
        transition: 'opacity var(--duration-fast) var(--ease-out)',
      }}
    >
      {props.label}
    </button>
  );
}
