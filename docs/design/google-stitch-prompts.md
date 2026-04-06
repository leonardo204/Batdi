# 밧디 (Batdi) — Google Stitch Screen Design Prompts

> **목적**: Google Stitch에 입력하여 주요 화면 시안을 생성하고, 개발 레퍼런스로 활용
> **디자인 기조**: Dark-first, 미니멀, 한국 프로야구 감성. 참고 벤치마크: Linear · Vercel Dashboard · Claude.ai · Arc Browser
> **폰트**: Pretendard (한글), Inter 또는 시스템 산세리프 (영문/숫자는 모노스페이스)

---

## 공통 디자인 컨텍스트 (모든 프롬프트 앞에 붙여넣기)

아래 블록을 각 프롬프트 **앞에 공통으로** 붙여넣으면 일관성이 유지됩니다.

```
[Common Context]
App name: 밧디 (Batdi) — A KBO Korean baseball AI chatbot (mobile-first PWA).
Design style: Dark mode, minimal, clean. Reference: Linear app, Vercel dashboard, Claude.ai chat UI.
Background: #0B0B0E. Card/surface: #14151A. Border: #2A2B33.
Primary text: #E8E8EC. Muted text: #8A8B93. Subtle text: #5A5B63.
Accent color: Team-specific (Hanwha Orange #F15B2A, Doosan Navy #131230, Kia Red #EA002C, Lotte Navy #041E42).
Font: Pretendard for Korean, system sans-serif. Monospace for numbers/stats.
Border radius: Buttons 10px, Cards 14px, Chat bubbles 20px.
Spacing: 8px base grid. Shadows: subtle, single-direction, low opacity.
Device: iPhone 15 Pro frame (393×852). Bottom safe area respected.
Navigation: NO bottom tab bar. Chat is the single primary view. No tabs like "순위", "데이터", "프로필" etc.
Language: Korean (한국어) for all UI text.
```

---

## Screen 1: 온보딩 — 팀 선택

**화면 설명**: 앱 최초 진입 시 응원 팀을 선택하는 화면. 4개 팀 카드를 그리드로 배치.

```
[Common Context 붙여넣기]

Design a mobile onboarding screen for team selection.

Layout:
- Top: App logo "밧디" in bold 28px white text, centered. Below it subtitle "너의 야구 친구" in 14px muted gray (#8A8B93).
- Center: 2×2 grid of team selection cards with 12px gap.
- Each card: 14px border-radius, 1px border #2A2B33, background #14151A, padding 20px.
  - Team logo placeholder (circular, 48px, centered).
  - Team name in 16px semibold white, centered below logo.
  - Team slogan in 12px muted gray, centered.
  - On selection: border changes to team primary color (2px), subtle glow.
- Bottom: "다음" (Next) button, full width minus 32px margin, 48px height, 10px radius, disabled state (opacity 50%) until a team is selected. Active state uses selected team's primary color as background.

The four teams:
1. 한화 이글스 — accent #F15B2A (orange) — slogan "새 시대의 독수리"
2. 두산 베어스 — accent #131230 (navy) with secondary #C8102E — slogan "잠실의 여유"
3. 기아 타이거즈 — accent #EA002C (red) — slogan "광주 열혈 응원단장"
4. 롯데 자이언츠 — accent #041E42 (navy) with secondary #ED1C24 — slogan "부산의 자존심"

No gradients, no 3D effects, no neon glow. Clean and minimal.
```

---

## Screen 2: 온보딩 — 프로필 설정

**화면 설명**: 팀 선택 후, 야구 지식 수준과 관심사를 설정하는 화면.

```
[Common Context 붙여넣기]

Design a mobile onboarding profile setup screen. The user has already selected Hanwha Eagles (accent color: #F15B2A orange).

Layout:
- Top bar: Back arrow (left), step indicator "2/3" (center, muted text), skip button "건너뛰기" (right, muted text).
- Section 1 — "야구 지식 수준" (Knowledge Level):
  - 3 horizontal pill-shaped option buttons in a row with 8px gap.
  - Options: "입문 🌱", "중급 ⚾", "고수 🔥"
  - Unselected: #14151A background, #2A2B33 border, #8A8B93 text.
  - Selected: #F15B2A border (2px), #F15B2A text, subtle orange tint background.
- Section 2 — "대화 스타일" (Chat Style):
  - 3 vertical cards stacked, 8px gap, full width.
  - Each card: #14151A background, 14px radius, padding 16px, 1px border.
    - Title in 15px semibold. Description in 13px muted gray.
  - Options:
    1. "기본" — "팀 사투리로 자연스럽게"
    2. "친근한" — "밈과 드립 많이, 찐팬 느낌"  
    3. "분석형" — "데이터 중심, 진지한 야구 토크"
  - Selected: orange left accent bar (3px, border-left).
- Section 3 — "좋아하는 선수" (Favorite Players, Optional):
  - Search input field: #14151A background, placeholder "선수 검색...", magnifying glass icon.
  - Below input: 2-3 example player chips shown as pre-suggestions.
  - Chip style: pill shape, #14151A bg, border #2A2B33, 12px text, 24px height. Has × close button.
- Bottom: "시작하기" button, full width, #F15B2A background, white text "밧디와 대화 시작!", 48px height, 10px radius.

Minimal, dark, no excessive decoration.
```

---

## Screen 3: 메인 채팅 — 빈 상태 (Empty State)

**화면 설명**: 팀 선택 완료 후 처음 진입하는 채팅 화면. 아직 대화 없음.

```
[Common Context 붙여넣기]

Design the main chat screen in empty state for Hanwha Eagles fan (accent: #F15B2A).

Layout:
- Top bar (56px height): 
  - Left: Small circular team badge with orange ring (28px).
  - Center: "밧디 · 한화" in 16px medium weight, #F15B2A colored text.
  - Right: Ellipsis menu icon (⋯) in muted gray.
- Center (empty state):
  - Large friendly mascot placeholder (abstract baseball icon or chat bubble icon, 80px, muted).
  - Greeting text: "안녕하셔유! 밧디예유~ 🧡" in 18px, white, centered.
  - Subtitle: "오늘 한화 경기 궁금한 거 물어봐유!" in 14px, muted gray, centered.
  - Below: 3 horizontal suggestion chips in a scrollable row.
    - Chip style: pill shape, #14151A bg, 1px border #2A2B33, 13px text #E8E8EC, padding 8px 14px.
    - Suggestions: "오늘 경기 스코어", "팀 순위", "최근 뉴스"
- Bottom input area (fixed, 72px + safe area):
  - Input field: #14151A bg, 1px border #2A2B33, 10px radius, placeholder "밧디에게 물어보기..." in muted gray.
  - Send button: Circle, 40px, #F15B2A bg, white arrow-up icon. Disabled (opacity 50%) when input empty.
  - Safe area padding at bottom (34px for iPhone).

No bottom tab bar in this design — chat is the primary and only main view.
Clean, spacious, inviting first impression.
```

---

## Screen 4: 채팅 — 스코어 응답 (Score Intent)

**화면 설명**: 사용자가 "오늘 경기 어때?" 질문 → 스코어보드 위젯 + 감성 리액션 응답.

```
[Common Context 붙여넣기]

Design the chat screen showing a score inquiry conversation for a Hanwha Eagles fan (accent: #F15B2A).

Message flow (top to bottom):
1. User message (right-aligned):
   - Bubble: #F15B2A background, white text, 20px radius all corners.
   - Text: "오늘 경기 어때유?"
   - Max-width: 85% of screen. Padding 12px 16px.
   - Timestamp below: "오후 7:32" in 11px subtle gray, right-aligned.

2. Bot message (left-aligned):
   - Small bot avatar (24px circle, #14151A with orange accent ring) to the left.
   - Text bubble: #14151A background, 1px border #2A2B33, 20px radius.
   - Text: "지금 경기 중이여! 한화가 리드하고 있어유~ 💪"
   - Max-width: 95%.

3. Scoreboard card (below bot bubble, 8px margin-top):
   - Card: #14151A bg, 1px border #2A2B33, 14px radius, padding 16px.
   - Header: "TODAY'S GAME" in 11px uppercase, letter-spacing 0.05em, muted gray, left-aligned.
   - Score display (centered, large):
     - Left: "한화" team name 13px + logo placeholder + score "5" in 32px bold monospace.
     - Center: "vs" in 12px muted gray, or a thin vertical divider.
     - Right: "기아" team name 13px + logo placeholder + score "3" in 32px bold monospace.
   - Status bar below score: "7회초 · 한화 공격" in 13px, #4ADE80 (green for live), left-aligned.
   - Bottom row: "이글스파크 · 관중 18,234" in 11px subtle gray.

4. Below the card, suggestion chips:
   - "이닝별 스코어", "오늘 선발 투수", "실시간 중계"
   - Same chip style as empty state.

Bottom input area stays fixed. Show the conversation scrolled naturally.
```

---

## Screen 5: 채팅 — 타자 스탯 응답 (Stats Intent)

**화면 설명**: "문보경 성적 어때?" 질문에 타자 성적 카드로 응답.

```
[Common Context 붙여넣기]

Design the chat screen showing a player stats response for a Hanwha Eagles fan (accent: #F15B2A).

Message flow:
1. User message (right-aligned):
   - Orange bubble: "문보경 올 시즌 성적 알려줘유"

2. Bot text response (left-aligned):
   - "문보경 시즌 성적이여! 타율이 미쳤다 그려~ 🔥"

3. Player stats card (below bot bubble):
   - Card: #14151A bg, 1px border #2A2B33, 14px radius, padding 16px.
   - Player header row:
     - Left: Player avatar placeholder (40px circle).
     - Name: "문보경" in 16px semibold white.
     - Sub: "한화 이글스 · #52 · 내야수" in 12px muted gray.
   - Divider: 1px #2A2B33, margin 12px 0.
   - Stats grid (2 rows × 3 columns):
     - Each stat cell: Label on top in 11px uppercase muted gray, Value below in 20px bold monospace.
     - Row 1: 타율 ".342", 홈런 "18", 타점 "67"
     - Row 2: 안타 "128", OPS "1.024", WAR "4.2"
     - All numbers use monospace font with tabular-nums.
   - Trend sparkline below stats: A tiny line chart (60px height) showing batting average trend over last 10 games. Line color: #F15B2A. Area fill: #F15B2A at 10% opacity.

4. Suggestion chips: "투수 성적도 보기", "팀 순위", "비교할 선수"

Ensure numbers are crisp monospace. No decorative elements. Data-focused, clean layout.
```

---

## Screen 6: 채팅 — 뉴스 응답 (News Intent)

**화면 설명**: "한화 최근 소식" 질문에 뉴스 카드 리스트로 응답.

```
[Common Context 붙여넣기]

Design the chat screen showing news results for a Hanwha Eagles fan (accent: #F15B2A).

Message flow:
1. User message: "한화 최근 뉴스 보여줘"

2. Bot text: "최신 한화 소식 가져왔어유! 📰"

3. News card list (below bot bubble, single card containing 3 news items):
   - Card: #14151A bg, 1px border #2A2B33, 14px radius, padding 16px.
   - Header: "LATEST NEWS" in 11px uppercase muted gray, letter-spacing 0.05em.
   - 3 news items stacked vertically, separated by 1px #2A2B33 dividers:
     - Each item:
       - Title: 15px medium weight, white, max 2 lines with ellipsis. Tappable (underline on hover).
       - Meta row: Source name in 12px muted gray + "·" + relative time "2시간 전" in 12px subtle gray.
       - No thumbnail images — text only, clean.
     - Example items:
       1. "한화 문보경, 시즌 18호 홈런… 팀 타율 1위 질주" — 스포츠조선 · 2시간 전
       2. "이글스파크 매진 행렬, 올 시즌 관중 100만 돌파 임박" — OSEN · 5시간 전
       3. "한화 불펜 보강 급한 불… 트레이드 카드는?" — 일간스포츠 · 8시간 전

4. Suggestion chips: "기사 더 보기", "오늘 경기", "팀 순위"

Clean news feed style. No images, no cards-within-cards. Simple list format inside one card.
```

---

## Screen 7: 채팅 — 일정 응답 (Schedule Intent)

**화면 설명**: "이번 주 경기 일정" 질문에 경기 일정 카드로 응답.

```
[Common Context 붙여넣기]

Design the chat screen showing a game schedule response for a Hanwha Eagles fan (accent: #F15B2A).

Message flow:
1. User message: "이번 주 한화 경기 일정 알려줘유"

2. Bot text: "이번 주 일정이여! 홈 경기 많아서 좋겠다 그려~ 🏟️"

3. Schedule card (below bot bubble):
   - Card: #14151A bg, 1px border #2A2B33, 14px radius, padding 16px.
   - Header: "THIS WEEK" in 11px uppercase muted gray.
   - 4 game rows stacked vertically, 8px gap between rows:
     - Each row is a mini-card: #1C1D24 bg (surface-hover), 10px radius, padding 12px.
       - Left column (48px width):
         - Day: "월" in 14px semibold white.
         - Date: "4/7" in 12px muted gray.
       - Center column (flex grow):
         - Matchup: "한화 vs 기아" in 14px medium white.
         - Venue + Time: "이글스파크 · 18:30" in 12px muted gray.
       - Right column:
         - "HOME" badge in 10px uppercase, orange (#F15B2A) text, orange border pill, or
         - "AWAY" badge in muted gray text, gray border pill.
     - Example rows:
       1. 월 4/7 — 한화 vs 기아 — 이글스파크 18:30 — HOME
       2. 화 4/8 — 한화 vs 기아 — 이글스파크 18:30 — HOME
       3. 목 4/10 — 두산 vs 한화 — 잠실 18:30 — AWAY
       4. 금 4/11 — 두산 vs 한화 — 잠실 18:30 — AWAY

4. Suggestion chips: "4/7 선발 투수", "경기장 날씨", "예매하기"

Structured, easy-to-scan layout. Each game is visually distinct.
```

---

## Screen 8: 채팅 — 순위표 응답 (Standings)

**화면 설명**: "지금 순위 어때?" 질문에 KBO 순위표 위젯으로 응답.

```
[Common Context 붙여넣기]

Design the chat screen showing KBO standings for a Hanwha Eagles fan (accent: #F15B2A).

Message flow:
1. User message: "지금 순위 어때유?"

2. Bot text: "현재 순위여! 한화 2위 유지 중이여~ 올해는 진짜 되는 거여! 🦅"

3. Standings table card (below bot bubble):
   - Card: #14151A bg, 1px border #2A2B33, 14px radius, padding 16px.
   - Header: "2026 KBO STANDINGS" in 11px uppercase muted gray.
   - Table layout with columns:
     - "#" (rank, 24px width) | "팀" (team name, flex) | "승" (W) | "패" (L) | "승률" (PCT) | "게임차" (GB)
     - Column headers: 11px uppercase muted gray, bottom border 1px.
     - Each row: 40px height, 14px text. Numbers in monospace tabular-nums.
     - My team (한화) row: highlighted with subtle orange left border (3px) and slightly brighter background (#1C1D24).
   - Example data (10 rows):
     1. LG — 42승 28패 .600 —
     2. 한화 — 40승 29패 .580 1.5 (highlighted row)
     3. 삼성 — 38승 31패 .551 3.5
     4. 기아 — 37승 33패 .529 5.0
     5. 두산 — 35승 34패 .507 6.5
     6. KT — 33승 36패 .478 8.5
     7. SSG — 32승 38패 .457 10.0
     8. NC — 30승 39패 .435 11.5
     9. 키움 — 29승 40패 .420 12.5
     10. 롯데 — 28승 42패 .400 14.0
   - All numbers right-aligned with monospace font.

4. Suggestion chips: "한화 최근 5경기", "1위와 비교", "팀 타율 순위"

Clean data table. No decorative team logos, just structured text with clear highlighting for user's team.
```

---

## Screen 9: 채팅 — 자유 대화 (Chat Intent)

**화면 설명**: 야구 잡담, 밈, 감성 대화. 위젯 없이 텍스트만.

```
[Common Context 붙여넣기]

Design the chat screen showing a casual conversation for a Hanwha Eagles fan (accent: #F15B2A). This screen has NO data cards — pure text chat only.

Show a longer conversation thread (6+ messages) to demonstrate the chat flow:

1. User: "밧디 오늘 기분 어때유?" (orange bubble, right)
2. Bot: "어유~ 한화가 어제 이겼으니까 기분 최고여! 밥이 꿀맛이었다니까유 🍚✨" (dark bubble, left)
3. User: "ㅋㅋㅋ 한화 팬은 이기면 밥이 맛있고 지면?" (orange bubble, right)
4. Bot: "지면은... 그래도 칼국수에 수육 한 상 하면 괜찮아유 ㅎㅎ 대전 맛집은 안 배신해유~ 🍜" (dark bubble, left)
5. User: "올해 한화 우승 가능?" (orange bubble, right)
6. Bot: "아 그럼유!! 타선이 이렇게 좋은 적이 없었다니까! 문보경이 미쳤고, 불펜만 버텨주면 10월에 맥주 한 잔 할 수 있어유~ 🍺 근데 조금... 아주 조금만 불안한 건 비밀이여 ㅎ" (dark bubble, left, longer text wrapping to multiple lines)

Design notes:
- Show natural spacing between messages (8px between same sender, 16px between different senders).
- Bot avatar (24px circle, orange ring) only appears on the first message in a consecutive bot sequence.
- Timestamps shown only on the first message of each time cluster (e.g., "오후 7:45").
- Input field at bottom with "밧디에게 물어보기..." placeholder.
- The conversation should feel warm, natural, like chatting with a fun friend.
- Long messages wrap naturally with --lh-relaxed (1.7 line height).
- No cards, no widgets, just text bubbles.
```

---

## Screen 10: 채팅 — 로딩/스켈레톤 상태

**화면 설명**: 사용자 질문 직후, 응답을 기다리는 중간 상태. 타이핑 인디케이터 + 스켈레톤 카드.

```
[Common Context 붙여넣기]

Design the chat screen in loading state for a Hanwha Eagles fan (accent: #F15B2A). Show the moment between user sending a message and the bot responding.

Message flow:
1. User message (already sent): "오늘 경기 스코어 알려줘유" (orange bubble, right)

2. Loading state (left-aligned, below user message):
   - Bot avatar (24px circle, orange ring).
   - Typing indicator text: "잠깐, 밧디가 찾아볼게유~" in 13px italic, muted gray (#8A8B93). Subtle pulsing opacity animation (0.5 → 1.0, 1.5s cycle).
   
3. Skeleton card (below typing indicator, 8px gap):
   - Card: #14151A bg, 1px border #2A2B33, 14px radius, padding 16px.
   - Height: 140px (pre-reserved for score intent).
   - Inside: Static placeholder blocks (NO shimmer animation):
     - Top: One short rectangle (60px × 10px, #2A2B33, 6px radius) — header placeholder.
     - Middle: Two large rectangles side by side (score placeholders), 80px × 28px each, #2A2B33, centered.
     - Bottom: One medium rectangle (120px × 10px, #2A2B33) — status placeholder.
   - All placeholder blocks use #2A2B33 (border color) as fill. Static, no shimmer, no animation.

4. Input area: Disabled state — send button at 50% opacity, input shows "응답 대기 중..." in subtle gray.

This is a transient state. The skeleton will be swapped in-place with the real scoreboard card when data arrives. No layout shift (CLS = 0).
```

---

## Screen 11: 마이페이지 — 프로필 & 설정

**화면 설명**: 사용자 프로필, 팀 정보, 레벨, 커스텀 페르소나 확인/수정 화면.

```
[Common Context 붙여넣기]

Design a "My Page" profile screen for a Hanwha Eagles fan (accent: #F15B2A).

Layout:
- Top bar (56px): "내 정보" in 18px semibold centered. Back arrow left.

- Profile section (top area):
  - Large avatar placeholder: 72px circle, #14151A bg, orange (#F15B2A) 3px border ring.
  - Username: "밧디팬123" in 18px semibold white, centered below avatar.
  - Team badge: "한화 이글스" pill badge, #F15B2A bg, white text, 12px, below username.

- Level progress card:
  - Card: #14151A bg, 14px radius, padding 16px, 1px border #2A2B33.
  - "Lv.7 열혈팬" in 16px semibold white.
  - Progress bar: Full width, 6px height, #2A2B33 bg track, #F15B2A fill at 65%.
  - Below bar: "2,340 / 3,600 XP" in 12px muted gray, right-aligned.

- Settings list (stacked menu items):
  - Each item: 56px height row, left icon (20px, muted), label 15px white, right chevron (›) muted.
  - Dividers: 1px #2A2B33 between items.
  - Items:
    1. 🏟️ "응원팀 변경" — right side shows current "한화" in muted text
    2. 💬 "대화 스타일" — right side shows "기본"
    3. ✏️ "커스텀 페르소나" — right side shows "설정됨" or "미설정"
    4. ⭐ "좋아하는 선수" — right side shows "3명"
    5. 📊 "야구 지식 수준" — right side shows "중급"
    6. 🔔 "알림 설정"
    7. 🌙 "다크모드" — right side toggle switch (on state, orange)

- Bottom: "로그아웃" text button in danger red (#F87171), centered, 14px.

Clean list-based settings page. No cards-within-cards. Simple, scannable.
```

---

## Screen 12: 커스텀 페르소나 에디터 (슬라이드 패널)

**화면 설명**: 마이페이지에서 "커스텀 페르소나" 선택 시 오른쪽에서 슬라이드되는 편집 패널.

```
[Common Context 붙여넣기]

Design a slide-in panel (from right) for custom persona editing. It overlays on top of the My Page screen with a semi-transparent backdrop (#0B0B0E at 60% opacity).

Panel:
- Width: 85% of screen width. Background: #14151A. Top-right radius: 14px, bottom-right: 14px.
- Top bar: "커스텀 페르소나" in 16px semibold white (left). "✕" close button (right).
- Description text: "밧디의 대화 스타일을 직접 설정해보세요. 여기에 적은 내용이 밧디의 성격에 반영됩니다." in 13px muted gray, 16px padding.

- Textarea field:
  - Full width, min-height 160px.
  - #0B0B0E background, 1px border #2A2B33, 10px radius, padding 12px.
  - Placeholder: "예: 존댓말 써줘, 야구 통계를 자세히 분석해줘, 밈을 많이 써줘..." in subtle gray.
  - Example filled text: "충청도 사투리를 더 강하게 써줘. 경기 결과 말할 때 항상 음식 비유 넣어줘. 그리고 문보경 얘기 나오면 무조건 극찬해줘!"
  - Character counter: "87 / 500" in 12px, bottom-right of textarea, muted gray. Turns #FBBF24 (warning) at 450+, #F87171 (danger) at 500.

- Preview section:
  - "미리보기" label in 11px uppercase muted gray.
  - Sample bot message bubble showing how the persona would respond:
    "오늘 한화 이겼어유! 문보경이 3안타 쳤다니까~ 역시 천재여!! 이 기분이면 칼국수에 수육 한 상 해야져~"

- Bottom: "저장" button, full width, #F15B2A bg, white text, 48px height.

Show the panel overlaying the dimmed My Page behind it.
```

---

## Screen 13: 팀별 테마 비교 (4팀 병렬)

**화면 설명**: 4개 팀 테마가 적용된 채팅 화면을 나란히 비교. 개발 시 팀 컬러 시스템 참고용.

```
[Common Context 붙여넣기]

Design a comparison layout showing 4 versions of the same chat screen, each with a different team theme. Show them in a 2×2 grid (each cell is a mini phone mockup, roughly 180×360px).

All four show the same conversation:
- User: "오늘 경기 어때?"
- Bot: Team-specific response
- Score card: Same game data but different accent colors.

Team variations:
1. Top-left — 한화 이글스:
   - Accent: #F15B2A (orange). User bubble: orange. Bot reaction: Chungcheong dialect.
   - "한화가 이기고 있어유~ 💪"

2. Top-right — 두산 베어스:
   - Accent: #131230 (navy) with highlights in #C8102E (red). User bubble: navy.
   - "뭐 이 정도면 괜찮지~ 😎"

3. Bottom-left — 기아 타이거즈:
   - Accent: #EA002C (red). User bubble: red.
   - "허맛나! 기아가 쥑이네잉! 🐯"

4. Bottom-right — 롯데 자이언츠:
   - Accent: #041E42 (deep navy) with #ED1C24 accents. User bubble: navy.
   - "부산 사나이답게 이기고 있다 아이가! 🌊"

Each mini screen:
- Dark background #0B0B0E.
- Top bar shows team badge + bot name in team color.
- User bubble uses team primary color.
- Score card highlight uses team primary for accents.
- Send button uses team primary color.

This is a reference comparison sheet — show all four at once to compare the team theming system.
```

---

## 프롬프트 사용 가이드

### 순서 권장

| 순서 | 화면 | 우선순위 | 비고 |
|------|------|----------|------|
| 1 | Screen 3: 빈 채팅 | 필수 | 기본 레이아웃 확정 |
| 2 | Screen 4: 스코어 응답 | 필수 | 핵심 위젯 |
| 3 | Screen 9: 자유 대화 | 필수 | 텍스트 흐름 확인 |
| 4 | Screen 1: 팀 선택 | 필수 | 첫인상 |
| 5 | Screen 5: 타자 스탯 | 높음 | 데이터 테이블 |
| 6 | Screen 8: 순위표 | 높음 | 테이블 레이아웃 |
| 7 | Screen 10: 로딩 상태 | 높음 | UX 패턴 |
| 8 | Screen 6: 뉴스 | 보통 | 리스트 패턴 |
| 9 | Screen 7: 일정 | 보통 | 리스트 패턴 |
| 10 | Screen 2: 프로필 설정 | 보통 | 온보딩 |
| 11 | Screen 11: 마이페이지 | 보통 | 설정 |
| 12 | Screen 12: 페르소나 에디터 | 낮음 | 오버레이 |
| 13 | Screen 13: 팀별 비교 | 참고 | 테마 검증용 |

### 팁

1. **Common Context를 항상 붙여넣기**: 일관된 색상/폰트/스타일 유지.
2. **한 번에 한 화면씩**: Stitch가 혼란 없이 집중하도록.
3. **수정 피드백 시**: "더 어둡게", "간격 넓히기", "폰트 키우기" 등 구체적으로.
4. **팀 변경 테스트**: accent color만 바꿔서 같은 프롬프트 재실행하면 팀별 검증 가능.
5. **Export**: 각 화면을 PNG로 저장 → `docs/design/stitch_batdi_team_onboarding/` 폴더에 정리.

---

## Stitch 생성 결과물 (Reference)

> **주의**: 아래 결과물은 **개발 레퍼런스**용입니다. 그대로 사용하는 것이 아니라, 디자인 방향과 컴포넌트 구조를 참고하여 구현합니다.

각 폴더에는 `screen.png` (시안 이미지)와 `code.html` (Tailwind HTML 프로토타입)이 포함됩니다.

| 폴더 | 화면 | 설명 | 비고 |
|------|------|------|------|
| `00-design-system/` | 디자인 시스템 | 컬러·타이포·컴포넌트 스펙 (DESIGN.md) | Stitch 자체 생성 |
| `01-onboarding-team-select/` | 팀 선택 | 6팀 카드 그리드 (MVP 4팀만 사용) | 삼성·LG 제외 필요 |
| `02-onboarding-profile-setup/` | 프로필 설정 | 지식수준·스타일·관심선수 | — |
| `03-chat-empty/` | 채팅 빈 상태 | 환영 메시지 + 제안 칩 | — |
| `04-chat-schedule/` | 경기 일정 | 주간 일정 카드 (v1) | — |
| `05-chat-player-stats/` | 타자 스탯 | 성적 그리드 + 스파크라인 | — |
| `06-chat-news/` | 뉴스 응답 | 뉴스 리스트 카드 | — |
| `07-chat-schedule-weekly/` | 주간 일정 상세 | 주간 일정 카드 (v2, 상세) | 04와 비교 후 택 1 |
| `08-chat-live-score/` | 라이브 스코어 | 스코어보드 위젯 | — |
| `09-chat-free-talk/` | 자유 대화 | 텍스트 전용 멀티턴 | 마이크·+ 버튼 제거 필요 |
| `10-chat-loading-skeleton/` | 로딩 상태 | 타이핑 인디케이터 + 스켈레톤 | — |
| `11-mypage/` | 마이페이지 | 프로필·레벨·설정 리스트 | 탭 바 제거 필요 |
| `12-chat-standings/` | 순위표 | KBO 10팀 순위 테이블 | — |
| `13-team-theme-comparison/` | 팀별 비교 | 4팀 테마 2×2 비교 시트 | 개발 참고용 |

### 구현 시 수정 사항

1. **탭 바 제거**: 모든 화면에서 하단 탭 네비게이션 제거. 채팅이 단일 메인 뷰
2. **팀 4개로 제한**: 온보딩 팀 선택에서 삼성·LG 제거 (MVP 범위: 한화·두산·기아·롯데)
3. **입력창 통일**: 마이크·파일첨부(+) 버튼 제거. 텍스트 입력 + 전송 버튼만
4. **일정 화면 통합**: 04, 07 중 하나 선택 (07 권장 — 더 상세)
5. **디자인 토큰 기준**: Stitch HTML이 아닌 `docs/plan/batdi-uiux-guideline.md`의 CSS 변수가 SSOT

---

*생성일: 2026-04-06 · 결과물 추가: 2026-04-06*
