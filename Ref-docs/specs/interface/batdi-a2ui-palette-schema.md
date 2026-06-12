---
id: batdi-a2ui-palette-schema
title: 밧디 A2UI 컴포넌트 팔레트 & JSON Schema
type: interface
version: 0.1.0
status: approved
scope: A2UI 화이트리스트 팔레트 — 원자 컴포넌트·야구 도메인 widget 10종·UIValidator JSON Schema·데이터 바인딩 규칙
related: [batdi-architecture, batdi-uiux-guideline]
updated: 2026-06-12
---

## 5. A2UI Component Palette

### 5.1 팔레트 설계 원칙 (Hybrid)

**원자 컴포넌트**(범용) + **도메인 widget**(야구 특화) 동시 제공. LLM은 도메인 widget 우선 선택, 없으면 원자로 조합.

> **악센트 UI 요소는 `--team-accent`를 참조**한다. 저명도 팀(두산·롯데)은 secondary로 자동 폴백. 상세: uiux-guideline §2.1.1

### 5.2 원자 컴포넌트

| 타입 | 프롭 |
|------|------|
| `column` / `row` / `grid` | children, gap, padding, align |
| `card` | children, variant(default/emphasized/muted), padding |
| `text` | content, variant(title/subtitle/body/caption), weight, tone |
| `badge` / `chip` | label, tone(info/success/warning/danger/team) |
| `divider` | orientation |
| `table` | rows, cols, tabularNums |
| `button` | label, variant, action |
| `accordion` / `tabs` | items |
| `image` / `avatar` | src, alt, size |

### 5.3 야구 도메인 widget

| widget | 필수 바인딩 |
|--------|-----------|
| `scoreboardWidget` | homeTeam, awayTeam, homeScore, awayScore, inning, status |
| `battingLineWidget` | player, ab, h, hr, rbi, avg |
| `pitchingLineWidget` | player, ip, h, er, k, bb, era, pitches |
| `standingsRowWidget` | rank, team, w, l, pct, gb |
| `playerChipWidget` | name, team, position, number |
| `gameScheduleWidget` | date, home, away, venue, time |
| `trendSparkline` | data[], type(era/avg/war) |
| `headToHeadWidget` | playerA, playerB, stats |
| `newsItemWidget` | title, source, url, publishedAt |
| `levelProgressWidget` | currentLevel, xp, nextLevelXp |

### 5.4 JSON Schema 검증 (UIValidator)

```typescript
const A2UISchema = {
  surfaceUpdate: {
    surfaceId: 'string',
    components: {
      type: 'array',
      maxDepth: 4,                     // 중첩 최대 4단계
      maxNodes: 30,                    // 총 노드 30개 제한
      itemSchema: {
        type: { enum: ALLOWED_TYPES }, // 화이트리스트 외 차단
        props: 'validated per type'
      }
    }
  },
  dataModelUpdate: { /* ... */ },
  beginRendering: { /* ... */ }
};
```

**검증 실패 시 Fallback 정책 — 재호출 없음 (레이턴시 우선)**

L3 TTFB가 이미 2~3초인데 LLM 재호출은 5초+ 지연을 유발해 UX를 망친다. 따라서 **재호출 경로 제거**.

1. Schema·팔레트·바인딩 검증 실패 → **즉시** 해당 intent의 L1 기본 Template(scoreboardWidget·newsItemWidget 등)으로 렌더링
2. 실패한 A2UI JSONL 페이로드는 **Langfuse에 `llm_ui_invalid` 에러 이벤트**로 비동기 기록 (개발자 튜닝용)
3. 런타임은 사용자 경험(조용한 세련됨)을 지키고, 프롬프트 개선은 오프라인 루프에서 처리

### 5.5 데이터 바인딩 규칙

- 모든 수치·문자열 실값 필드는 `{{bind:"data.path"}}` 또는 `{{llm.reaction}}` 참조만 허용
- 리터럴 허용: static label (e.g. `"경기 종료"`), styling 값
- Validator가 모든 value를 정규식 검사: `/\{\{(bind|llm):[^}]+\}\}/` 또는 whitelist
- 위반 시 차단 + 트레이스 기록
