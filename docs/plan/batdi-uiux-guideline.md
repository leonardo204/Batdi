# 밧디(batdi) UI/UX 디자인 지침 (v2)

> 작성일: 2026-04-04 (v2 — CopilotKit A2UI 렌더러 통합)
> 대상: `apps/web` (Next.js 14+ App Router + React 18 + Tailwind + CopilotKit + A2UI + PWA)
> 원칙: **Simple is best. 촌스럽지 않게. 디자이너 핸드오프 가능한 구조.**
> 연결 문서: [service-plan](./batdi-service-plan.md) · [dev-plan](./batdi-development-plan.md) · [architecture](./batdi-architecture.md)

---

## 1. 디자인 철학

### 1.1 3대 원칙

1. **조용한 세련됨 (Quiet Sophistication)**
   - 채도 낮은 중성 팔레트 + 팀 컬러 1색 악센트
   - 대비·공간·타이포가 말하게 한다 (장식 금지)
2. **대화 우선 (Conversation-First)**
   - 화면의 주인공은 **메시지 버블과 카드**다. 사이드바·헤더·배너 모두 보조
   - 사용자 첫 화면 시선: 상단 팀 배지(8%) → 메시지 영역(72%) → 입력창(20%)
3. **촌스러움 금지 (No Cringe)**
   - 금지: 과한 그림자, 네온 그라디언트, 이모지 도배, 굴림체, 만화형 폰트, 과장된 드롭섀도, 3D 버튼
   - 허용: 부드러운 elevation (0-2dp), 단일 방향 그림자, 절제된 모션

### 1.2 레퍼런스 (벤치마크)

| 출처 | 참고 요소 |
|------|----------|
| **Linear** (linear.app) | 여백·타이포 위계·키보드 중심 인터랙션 |
| **Vercel Dashboard** | 미니멀 카드, 상태 배지, 다크모드 톤 |
| **Claude.ai (Anthropic)** | 대화 UI, 스트리밍 텍스트, 코드블록 스타일 |
| **Arc Browser** | 사이드바, 부드러운 전환 애니메이션 |
| **Figma Community — "Chat UI" / "Sports Dashboard"** | 카드 레이아웃, 팀 컬러 적용 패턴 |
| **Radix UI / shadcn/ui** | 접근성·구성 방식 기반 컴포넌트 |
| **Tailwind UI / Untitled UI** | 폼·모달·리스트 패턴 |
| **Google Stitch 시안** | 화면별 레이아웃·컴포넌트 구조 참고 → [`docs/design/stitch_batdi_team_onboarding/`](../design/stitch_batdi_team_onboarding/) (레퍼런스용, 그대로 사용 금지) |

---

## 2. 디자인 토큰 (Single Source of Truth)

디자이너 핸드오프의 핵심: **모든 시각 속성은 토큰 파일에 집중**. 컴포넌트는 토큰만 참조. 디자이너가 `tokens.css` / `tailwind.config.ts` 한 파일만 수정하면 전체 톤 재편 가능.

### 2.1 컬러 토큰

```css
/* packages/ui/src/tokens.css — 디자이너가 편집하는 단일 진입점 */
:root {
  /* Neutral (중성 그레이스케일) — 기본 */
  --color-bg:            #0B0B0E;  /* 배경 (다크모드 기본) */
  --color-surface:       #14151A;  /* 카드·패널 */
  --color-surface-hover: #1C1D24;
  --color-border:        #2A2B33;
  --color-text:          #E8E8EC;  /* 주 텍스트 */
  --color-text-muted:    #8A8B93;
  --color-text-subtle:   #5A5B63;

  /* Semantic */
  --color-success: #4ADE80;
  --color-warning: #FBBF24;
  --color-danger:  #F87171;
  --color-info:    #60A5FA;

  /* Team Accent (주입식 — 사용자 팀 선택 시 data-team 속성으로 스위치) */
  --team-primary:    var(--team-hanwha-primary);
  --team-secondary:  var(--team-hanwha-secondary);
}

/* 팀별 컬러 (공식 팀 컬러 기반 — 채도 약간 낮춤) */
[data-team="hanwha"] {
  --team-hanwha-primary:   #F15B2A;  /* 한화 오렌지 */
  --team-hanwha-secondary: #FFD200;
}
[data-team="doosan"] {
  --team-doosan-primary:   #131230;  /* 두산 네이비 */
  --team-doosan-secondary: #C8102E;
}
[data-team="kia"] {
  --team-kia-primary:   #EA002C;    /* 기아 레드 */
  --team-kia-secondary: #06141F;
}
[data-team="lotte"] {
  --team-lotte-primary:   #041E42;  /* 롯데 네이비 */
  --team-lotte-secondary: #ED1C24;
}

/* 라이트모드 (선택) */
[data-theme="light"] {
  --color-bg:      #FAFAFB;
  --color-surface: #FFFFFF;
  --color-border:  #E5E5EA;
  --color-text:    #14151A;
  /* ... */
}
```

**운영 규칙**
- 컴포넌트 내 **하드코딩 색상 절대 금지** (`#FFFFFF`, `rgb(...)` 등). 오직 `var(--color-*)`만 사용
- 팀 컬러는 `data-team` 속성으로 런타임 스위치 — 프로필·랜딩·채팅 컨테이너 루트에 주입
- 다크모드가 **기본**, 라이트모드는 설정 토글
- **저명도 팀 컬러 시인성 보정 필수** (아래 §2.1.1 참조)

#### 2.1.1 저명도 팀 컬러 대비 보정 규칙

두산(#131230)·롯데(#041E42) 등 **다크 배경(#0B0B0E)과 명도 차이가 작은 팀 컬러**는 그대로 사용하면 텍스트·버블·뱃지·카드 보더가 식별 불가능해진다.

**원칙**: `--team-primary`가 배경 대비 **WCAG 2.1 AA 기준 명도 대비비(contrast ratio) 3:1 미만**일 경우, 해당 요소에 자동 보정 적용.

**보정 전략 (팀 컬러 자체는 변경하지 않음)**:

| UI 요소 | 기본 (고명도 팀: 한화·기아) | 보정 (저명도 팀: 두산·롯데) |
|---------|---------------------------|---------------------------|
| **사용자 채팅 버블** | `--team-primary` 배경 + 흰색 텍스트 | `--team-secondary` 배경 + 흰색 텍스트 |
| **전송 버튼** | `--team-primary` 배경 | `--team-secondary` 배경 |
| **상단바 팀명** | `--team-primary` 컬러 텍스트 | `--team-secondary` 컬러 텍스트 |
| **카드 강조 보더** | `--team-primary` 2px 보더 | `--team-secondary` 2px 보더 |
| **팀 뱃지 링** | `--team-primary` 링 | `--team-secondary` 링 |
| **프로그레스 바** | `--team-primary` fill | `--team-secondary` fill |
| **제안 칩 (선택 상태)** | `--team-primary` 보더/텍스트 | `--team-secondary` 보더/텍스트 |

**구현 방법**: CSS에서 `--team-accent`를 도입하여, 저명도 팀은 secondary로 자동 매핑.

```css
/* 기본: primary 사용 */
:root { --team-accent: var(--team-primary); }

/* 저명도 팀: secondary로 폴백 */
[data-team="doosan"] { --team-accent: var(--team-doosan-secondary); }  /* #C8102E 레드 */
[data-team="lotte"]  { --team-accent: var(--team-lotte-secondary); }   /* #ED1C24 레드 */
```

> UI 컴포넌트에서 악센트가 필요한 곳은 `--team-primary` 대신 **`--team-accent`를 참조**한다. `--team-primary`는 팀 로고 배경·그라디언트 등 의도적으로 어두운 색이 필요한 곳에만 직접 사용.

### 2.2 타이포그래피

```css
:root {
  --font-sans: 'Pretendard Variable', 'Pretendard', -apple-system,
               'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
  --font-mono: 'JetBrains Mono', 'D2Coding', monospace;

  /* Scale (Perfect Fourth 1.333) */
  --text-xs:   0.75rem;   /* 12 */
  --text-sm:   0.875rem;  /* 14 */
  --text-base: 1rem;      /* 16 — 본문 기본 */
  --text-lg:   1.125rem;  /* 18 */
  --text-xl:   1.333rem;  /* 21 */
  --text-2xl:  1.777rem;  /* 28 */
  --text-3xl:  2.369rem;  /* 38 */

  /* Weight */
  --fw-regular: 400;
  --fw-medium:  500;
  --fw-semibold: 600;
  --fw-bold:    700;

  /* Line-height */
  --lh-tight: 1.25;
  --lh-normal: 1.5;
  --lh-relaxed: 1.7;   /* 채팅 버블 기본 */
}
```

**폰트 결정**: **Pretendard Variable** — 한글·영문 모두 깔끔, 무료·OFL, 한국 제품에 최적. (가장 "촌스럽지 않은" 한글 폰트)

**사용 규칙**
- 본문: `--text-base`, `--fw-regular`, `--lh-relaxed`
- 카드 헤더: `--text-sm`, `--fw-medium`, `uppercase` + `letter-spacing: 0.05em`
- 메시지 버블: `--text-base`, `--lh-relaxed`
- 숫자(스코어·스탯): `--font-mono` + `tabular-nums` (자릿수 흔들림 방지)

### 2.3 Spacing · Radius · Elevation

```css
:root {
  /* 8px 베이스 스케일 */
  --space-1: 0.25rem;  /* 4 */
  --space-2: 0.5rem;   /* 8 */
  --space-3: 0.75rem;  /* 12 */
  --space-4: 1rem;     /* 16 */
  --space-5: 1.5rem;   /* 24 */
  --space-6: 2rem;     /* 32 */
  --space-7: 3rem;     /* 48 */
  --space-8: 4rem;     /* 64 */

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 10px;   /* 버튼·인풋 기본 */
  --radius-lg: 14px;   /* 카드 기본 */
  --radius-xl: 20px;   /* 메시지 버블 */
  --radius-full: 9999px;

  /* Elevation (단일 방향, 낮은 강도) */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.24);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.28);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.32);
  /* 라이트모드는 0.04~0.08로 감소 적용 */
}
```

### 2.4 Motion

```css
:root {
  --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);

  --duration-fast:   120ms;
  --duration-normal: 200ms;
  --duration-slow:   360ms;
}
```

**원칙**
- 모든 hover·focus 전환은 `--duration-fast` `--ease-out`
- 카드 등장: `fade + translateY(8px→0)` `--duration-normal`
- 메시지 스트리밍: 타이핑 커서 없음, 텍스트만 자연스럽게 채워짐
- `prefers-reduced-motion` 존중 — 모든 모션 `duration: 0.01ms`로 축소

---

## 3. 컴포넌트 전략

### 3.1 3레이어 컴포넌트 아키텍처

```
[Layer 1] Radix UI + shadcn/ui primitives
    ↓ (디자인 토큰으로 테마)
[Layer 2] A2UI 원자 + 도메인 widget (packages/a2ui-components)
    ↓ (LLM이 동적 선택, UIValidator로 통제)
[Layer 3] CopilotKit CopilotChat (headless) + A2UIRenderer
```

**Layer 1**: Radix UI + shadcn/ui 원자 컴포넌트를 `packages/ui/src/primitives/`에 복사 (Button, Input, Dialog, Toast, Dropdown, Tabs, Avatar, Card, Toggle, Accordion 등). **디자인 토큰만 참조**.

**Layer 2**: A2UI 컴포넌트 라이브러리 (`packages/a2ui-components`). LLM이 선택 가능한 팔레트. [architecture §5](./batdi-architecture.md) 팔레트 계약 준수. Layer 1 primitive를 조립하여 구현.

**Layer 3**: CopilotKit `CopilotChat` headless 모드 + `createA2UIMessageRenderer`. 채팅 셸·스트리밍·툴콜은 CopilotKit이 담당, UI는 A2UIRenderer가 Layer 2 컴포넌트로 치환하여 렌더.

### 3.2 A2UI 원자 컴포넌트 (범용)

| A2UI type | Layer 1 primitive 매핑 |
|-----------|----------------------|
| `column` / `row` / `grid` | flex div + gap token |
| `card` | shadcn Card |
| `text` (variant: title/subtitle/body/caption) | typography 스타일 토큰 |
| `badge` / `chip` | shadcn Badge |
| `divider` | hr |
| `table` | shadcn Table + tabular-nums |
| `button` | shadcn Button (variant/size) |
| `accordion` / `tabs` | Radix Accordion/Tabs |
| `image` / `avatar` | next/image + shadcn Avatar |

### 3.3 야구 도메인 widget

| widget | 용도 | 구현 위치 |
|--------|------|----------|
| `scoreboardWidget` | 실시간 스코어 (팀/점수/이닝/상태) | `packages/a2ui-components/scoreboard.tsx` |
| `battingLineWidget` | 타자 기록 1행 | `/batting-line.tsx` |
| `pitchingLineWidget` | 투수 기록 1행 | `/pitching-line.tsx` |
| `standingsRowWidget` | 순위표 1행 | `/standings-row.tsx` |
| `playerChipWidget` | 선수 요약 칩 | `/player-chip.tsx` |
| `gameScheduleWidget` | 경기 일정 카드 | `/game-schedule.tsx` |
| `trendSparkline` | 추이 미니차트 | `/trend-sparkline.tsx` |
| `headToHeadWidget` | 맞대결 비교 | `/head-to-head.tsx` |
| `newsItemWidget` | 뉴스 1건 | `/news-item.tsx` |
| `levelProgressWidget` | 레벨·XP 진행바 | `/level-progress.tsx` |

### 3.4 CopilotKit 셸 컴포넌트 (프론트 전용)

`apps/web/components/` — CopilotKit 연동 wrapper.

| 컴포넌트 | 용도 |
|----------|------|
| `<CopilotChatCustom>` | `CopilotChat` headless + 커스텀 입력창·메시지 레이아웃 |
| `<TypingIndicator>` | AG-UI `RunStarted` 수신 시 팀별 텍스트 ("잠깐, 밧디가 찾아볼게유~") |
| `<TeamBadge>` | 팀 로고 원형 배지 (비공식 고지 포함) |
| `<PersonaEditor>` | 커스텀 페르소나 편집기 (500자 카운터) |

### 3.5 A2UI 렌더러 테마 주입

```tsx
// apps/web/app/chat/providers.tsx
import { CopilotKitProvider } from "@copilotkit/react-core";
import { createA2UIMessageRenderer } from "@copilotkit/a2ui-renderer";
import { a2uiTheme } from "@/lib/a2ui-theme";
import { componentMap } from "@/lib/a2ui-component-map";

const A2UIRenderer = createA2UIMessageRenderer({
  theme: a2uiTheme,
  components: componentMap,  // Layer 2 widget 매핑
});

export function ChatProviders({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      renderActivityMessages={[A2UIRenderer]}
      agent="core"  // LangGraph CoAgent 이름
    >
      {children}
    </CopilotKitProvider>
  );
}
```

**`a2uiTheme`**: 디자인 토큰(§2) CSS variables를 A2UI 렌더러가 인식하도록 매핑.

**`componentMap`**: A2UI type 문자열 → React 컴포넌트. LLM이 `{"type":"scoreboardWidget"}` 출력 시 `<Scoreboard>` 렌더.

### 3.6 A2UI widget 공통 골격

```tsx
// packages/a2ui-components/scoreboard.tsx
export function Scoreboard(props: ScoreboardProps) {
  return (
    <div
      className="p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)]
                 border border-[var(--color-border)]"
      data-widget="scoreboard"
    >
      <div className="flex items-center gap-2 text-xs uppercase
                      tracking-wider text-[var(--color-text-muted)] mb-3">
        <span>{props.status}</span>
        <span className="text-[var(--color-text-subtle)]">·</span>
        <span>{props.inning}</span>
      </div>
      <div className="flex justify-between items-center tabular-nums">
        {/* body */}
      </div>
    </div>
  );
}
```

모든 widget은 **디자인 토큰만 참조**하며, hardcoded 색상·간격 금지.

---

## 4. 레이아웃 & 네비게이션

### 4.1 반응형 브레이크포인트 (Tailwind 기본)

| 구간 | 너비 | 레이아웃 |
|------|------|---------|
| mobile | <640px | 단일 컬럼, 하단 탭 바 (홈/대화/나) |
| tablet | 640~1024px | 좌측 슬림 사이드바 + 메인 |
| desktop | >1024px | 사이드바(대화목록) + 메인 채팅 + 우측 컨텍스트 패널(옵션) |

**모바일 퍼스트**. 모바일이 70%+ 예상.

### 4.2 주요 화면 레이아웃

**`/chat` (메인)**
```
┌─────────────────────────────────┐
│ [TeamBadge] 밧디 · 한화       [⋯]│  ← 상단바 56px
├─────────────────────────────────┤
│                                 │
│  (메시지 영역, 스크롤)           │
│   - 유저 버블 우측 정렬          │
│   - 밧디 버블 좌측 정렬          │
│   - 카드는 밧디 버블 아래 붙음   │
│                                 │
├─────────────────────────────────┤
│ [입력창               ] [보내기] │  ← 하단 고정 72px (safe-area 고려)
└─────────────────────────────────┘
```

**`/my/*`, `/settings`**: 상단 탭 네비 + 리스트. 모바일 하단 탭 바 유지.

### 4.3 탭바 vs 사이드바

- 모바일: **하단 탭 바** (홈/대화/나/설정 4개)
- 데스크톱: **좌측 사이드바** (대화 목록 포함, 접을 수 있음)

---

## 5. 인터랙션 패턴

### 5.1 AG-UI 이벤트 기반 스트리밍 UX

CopilotKit AG-UI Protocol 이벤트를 직접 사용:

1. **`RunStarted` 수신 (0ms)** → `<TypingIndicator>` + **intent 기반 `<SkeletonCard>` 사전 렌더**로 DOM 공간 선점 (CLS 0)
2. **`StateSnapshot`/`StateDelta`** (intent 확정) → 스켈레톤 종류 확정 (scoreboard/news/stats/...)
3. **`A2UIEnvelope` 수신** → `surfaceUpdate`가 스켈레톤 슬롯을 **in-place 교체** (레이아웃 이동 없이 fade-in)
4. **`TextMessageChunk` 스트리밍** → A2UI `{{llm.reaction}}` 슬롯에 문자 단위 누적
5. **`RunFinished`** → TypingIndicator 제거, 입력창 활성화

**Layout Shift (CLS) 방어 원칙**

- IntentRouter가 `StateSnapshot` 초기에 의도(`score`/`news`/`stats`/`chat`…)를 노출하므로, 프론트는 그 즉시 해당 intent의 스켈레톤 박스를 예약된 높이(§5.4)로 렌더.
- `<TypingIndicator>` + `<SkeletonCard>`가 **함께** 나타나 DOM 공간을 잡는다. A2UIEnvelope 도착 시 스켈레톤 영역을 동일 박스 크기의 실제 widget으로 swap → 스크롤 이동 0.
- shimmer 애니메이션은 쓰지 않는다 (조용한 세련됨). 1px 배경·border만으로 placeholder 표현.

**캐시 경로별 체감 속도**
- L0 HIT: ~200ms (envelope 즉시 반환)
- L1 Template: ~500ms (DB 조회 + 바인딩)
- L2 Partial: ~800ms (Template + LLM 리액션 스트리밍)
- L3 Full: ~2~3s (LLM UI 생성 + 검증 + 바인딩)

**스트리밍 텍스트**: 커서 깜빡임·타이핑 소리 없음. 텍스트가 자연스럽게 늘어남.

### 5.2 Copilot Action 확인 UI

LLM이 `useCopilotAction`을 호출할 때 프론트 UI 피드백:

| Action | 피드백 |
|--------|-------|
| `registerFavoritePlayer` | Toast "양현종 관심 선수 등록 완료" + 하트 아이콘 애니메이션 |
| `openPersonaEditor` | 우측 슬라이드 패널 오픈 |
| `jumpToConversation` | 전환 fade |
| `toggleNotification` | Toggle switch 상태 반영 + Toast |
| `showPlayerDetail` | Bottom sheet (mobile) / Dialog (desktop) |
| `requestScoreRefresh` | 스코어카드에 refresh 애니메이션 |
| `showTeamComparison` | 비교 뷰 inline 삽입 |

**원칙**: 모든 툴콜은 시각적 확인 피드백 필수 (silent action 금지).

### 5.3 키보드 접근성

- `Enter` 전송, `Shift+Enter` 줄바꿈
- `⌘/` 또는 `Ctrl+/` 단축키 패널
- `Esc` 모달 닫기, 입력 취소
- 모든 인터랙티브 요소 `focus-visible` 링 (`outline: 2px solid var(--team-accent)`)

### 5.4 로딩·빈 상태·에러 + Intent별 스켈레톤 높이 예약

- **스켈레톤 (shimmer 없음, 정적)** — `<TypingIndicator>`와 함께 DOM 공간 선점하여 CLS 0 보장.
- **Intent별 예약 높이** (실제 widget과 동일 박스 크기):

| Intent | 스켈레톤 컴포넌트 | 예약 높이 (mobile) |
|--------|-------------------|-------------------|
| `score` | `<SkeletonScoreboard>` | 140px |
| `stats` | `<SkeletonStatsCard>` | 180px |
| `news` | `<SkeletonNewsList>` | 220px (3건 기본) |
| `schedule` | `<SkeletonScheduleList>` | 160px |
| `chat`/`meme` | 스켈레톤 없음 (텍스트만) | — |
| `composite` (L3) | 범용 `<SkeletonBlock>` | 200px |

- **교체 방식**: `A2UIEnvelope` 도착 시 스켈레톤 영역을 실제 widget으로 in-place swap. 높이 오차는 `min-height` + `transition: min-height 180ms` 으로 흡수.
- **빈 상태** — 일러스트 대신 단문 1줄 + 유도 CTA (촌스러운 3D 일러스트 금지)
- **에러** — Toast (우상단, 3초 자동 닫힘) + 페르소나 Fallback 메시지 (플랜 §10.1)

---

## 6. 접근성 (a11y)

- WCAG 2.1 AA 준수 목표
- 색 대비 본문 4.5:1, 대형 텍스트 3:1 이상
- 모든 이미지 `alt`, 아이콘 버튼 `aria-label`
- 포커스 순서 논리적, skip-to-content 링크
- `prefers-reduced-motion`, `prefers-color-scheme` 존중

---

## 7. 디자이너 핸드오프 전략

**언제**: 1,000명 도달 또는 별도 예산 확보 시 (플랜 §22 "추후 검토").

**핸드오프 가능 구조**
1. **토큰 단일 파일** (`packages/ui/src/tokens.css` + `tailwind.config.ts`)
2. **컴포넌트 스토리북** — Phase 3에서 Storybook 도입 결정 (시간 되면)
3. **Figma 파일 최소 스펙** — 디자이너 합류 시 토큰을 Figma Variables로 1:1 미러링
4. **디자인 리뷰 체크리스트** — `docs/plan/design-review-checklist.md` (Phase 4에 작성)

**원칙**: 개발자가 Tailwind 클래스를 중구난방 작성하지 않는다. 공통 시각 규칙은 항상 토큰 → 컴포넌트 → 사용처 순으로 흐른다.

---

## 8. 개발 적용 로드맵 (dev-plan P0~P6과 연동)

| Phase | 적용 내용 |
|-------|----------|
| **P0** | 디자인 토큰 파일 확정 + Tailwind config 연동 + Radix/shadcn primitives 설치 + A2UI PoC scoreboard 1개 |
| **P1 W3** | CopilotKitProvider + A2UIRenderer 통합 + `a2uiTheme`·`componentMap` 작성 + CopilotChat headless + 팀 컬러 `data-team` |
| **P2 W5~W6** | `scoreboardWidget` 풀 구현 + 한화 테마 + `<TypingIndicator>` (AG-UI RunStarted 기반) |
| **P3 W7~W9** | 나머지 9개 도메인 widget 구현 + 3팀 컬러 토큰 + 지식 레벨 적응 UI |
| **P4 W10~W11** | 7종 Copilot Action 피드백 UI (Toast/BottomSheet/Dialog/SlidePanel) + `<LevelProgress>`, `<PersonaEditor>` |
| **P5 W13** | 접근성 감사(WCAG AA 95+) + 반응형 QA + `prefers-reduced-motion` |
| **P6** | Android/iOS 실기기 QA + PWA 설치 플로우 |

---

## 9. 금지 사항 (Anti-Patterns)

❌ 인라인 색상 값 (`#FF0000`, `rgba(...)`)
❌ 과도한 이모지 아이콘 사용 (메뉴·버튼에 이모지 넣지 않기)
❌ 3D 버튼, 네온 글로우, 과장된 drop-shadow
❌ 그라디언트 남발 (팀 컬러 전환 외)
❌ 굴림·맑은 고딕·만화 폰트
❌ 반응형 없이 데스크톱 고정 레이아웃
❌ `motion` 없는 전환 (클릭 시 즉시 튀는 UI)
❌ 접근성 무시한 `div onClick` — 반드시 `<button>` 또는 `role` 부여

---

## 10. 레퍼런스 문서

- Anthropic Frontend Skills — Claude.ai 채팅 UI 패턴 참조
- [CopilotKit Docs](https://docs.copilotkit.ai/) — Provider, A2UIRenderer, CopilotChat headless, useCopilotAction
- [A2UI Composer](https://a2ui-composer.ag-ui.com/) — A2UI JSONL spec 생성 도구
- [Radix UI Docs](https://www.radix-ui.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Pretendard](https://github.com/orioncactus/pretendard)
- [Refactoring UI (Adam Wathan)](https://www.refactoringui.com/) — 책·원칙 참조
- [Figma Community: Sports Dashboard / Chat UI Kits](https://www.figma.com/community)
- Context7: `copilotkit`, `tailwindcss`, `radix-ui`, `shadcn-ui` 라이브러리 문서 쿼리 시 사용

---

*v2 — CopilotKit + A2UI 렌더러 통합 반영. 디자이너 합류 시 Figma Variables와 1:1 동기화 재설계.*
