---
id: batdi-a2ui-palette-schema
title: 밧디 A2UI 컴포넌트 팔레트 & JSON Schema
type: interface
version: 1.0.0
status: approved
scope: A2UI 화이트리스트 팔레트 — 원자 컴포넌트·야구 도메인 widget 10종·UIValidator JSON Schema·데이터 바인딩 규칙. A2UI v1.0 RC 준거
related: [batdi-architecture, batdi-uiux-guideline]
updated: 2026-06-12
---

## A2UI 준거 (검증)

> Context7 + A2UI v1.0 스펙으로 검증한 사실. 본 문서의 envelope 명명·바인딩 규칙은 이 사실에 정합한다.

**1. A2UI 표준(a2ui.org) v1.0 = Release Candidate.** 프로덕션 권장은 v0.9.1. 표준 메시지셋은 `createSurface` / `updateComponents` / `updateDataModel` / `deleteSurface` / `actionResponse` / `callFunction` (각 메시지에 `"version":"v1.0"`). 컴포넌트는 인접 리스트(루트 id는 `"root"`, 각 노드는 `id` + `component` + 타입별 props). 바인딩은 **JSON Pointer(RFC 6901)** `{"path":"/user/name"}` — 상대경로·`formatString`(`${/path}` 보간)·`@index` 지원.

**2. MVP 타깃 = CopilotKit `@copilotkit/a2ui-renderer` 다이얼렉트.** 실제 우리가 사용할 렌더러는 `createA2UIMessageRenderer({theme})`를 `CopilotKitProvider`의 `renderActivityMessages`에 연결한다. 렌더러가 소비하는 JSONL 다이얼렉트:

```jsonl
{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"col","type":"column","children":["name-field"]},{"id":"name-field","type":"textInput","label":"이름","binding":"/name"}]}}
{"dataModelUpdate":{"surfaceId":"s1","path":"/","contents":[{"key":"name","value":""}]}}
{"beginRendering":{"surfaceId":"s1","root":"col","styles":{"theme":"light"}}}
```

즉 컴포넌트는 `id` + `type` + `children` + `binding`(JSON Pointer), 데이터는 `dataModelUpdate.contents:[{key,value}]`.

**3. 정합 결론.** 우리 envelope 명명(`surfaceUpdate` / `dataModelUpdate` / `beginRendering`)은 CopilotKit 렌더러와 일치하므로 **유지**한다. 단, **바인딩은 우리 `{{bind:"path"}}` 표기 → A2UI JSON Pointer(`"binding":"/path"`)로 컴파일**한다. `{{bind:}}`는 L1 템플릿 authoring 표기로만 유지하고, DataBinder가 emit 시 A2UI JSON Pointer로 변환한다.

**4. MVP vs 표준 마이그레이션.** MVP는 CopilotKit 다이얼렉트(`surfaceUpdate` / `dataModelUpdate` / `beginRendering`)를 타깃한다. A2UI 표준 v1.0(`createSurface` / `updateComponents` / ...)이 RC를 졸업하면 마이그레이션 대상이다. 패키지(확인): `@copilotkit/react`, `@copilotkit/runtime`, `@copilotkit/a2ui-renderer`.

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

> **A2UI 컴포넌트 모델**: 각 노드는 `id` + `type` + `children`(자식 id 배열) + `binding`(값 필드는 JSON Pointer). 루트 노드는 `beginRendering.root`로 지정한다. 위 원자 `type` 명은 CopilotKit 다이얼렉트의 컴포넌트 `type`으로 그대로 emit된다 (예: `column`, `card`, `text`, `table`, `button`).

### 5.3 야구 도메인 widget

| widget | 필수 바인딩 | A2UI 매핑 (type + binding) |
|--------|-----------|---------------------------|
| `scoreboardWidget` | homeTeam, awayTeam, homeScore, awayScore, inning, status | `card`>`row`/`text` 조합; 각 값은 `binding:"/home/score"` 등 JSON Pointer |
| `battingLineWidget` | player, ab, h, hr, rbi, avg | `table` row; 셀 값 `binding:"/batting/avg"` 등 |
| `pitchingLineWidget` | player, ip, h, er, k, bb, era, pitches | `table` row; 셀 값 JSON Pointer 바인딩 |
| `standingsRowWidget` | rank, team, w, l, pct, gb | `table` row; `binding:"/standings/@index/pct"` (배열 인덱스) |
| `playerChipWidget` | name, team, position, number | `chip`; `label`+`binding:"/player/name"` |
| `gameScheduleWidget` | date, home, away, venue, time | `card`>`row`; 각 필드 JSON Pointer 바인딩 |
| `trendSparkline` | data[], type(era/avg/war) | `image`/커스텀; `binding:"/trend/data"` 배열 |
| `headToHeadWidget` | playerA, playerB, stats | `grid`; 좌우 `binding:"/h2h/playerA/*"` |
| `newsItemWidget` | title, source, url, publishedAt | `card`>`text`; `binding:"/news/title"` 등 |
| `levelProgressWidget` | currentLevel, xp, nextLevelXp | `card`>`row`; `binding:"/level/xp"` 등 |

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

#### 5.5.1 Authoring 표기 → A2UI JSON Pointer emit 컴파일

`{{bind:}}`/`{{llm.reaction}}`는 **L1 템플릿 authoring 표기**다. DataBinder가 emit 시 A2UI **JSON Pointer(RFC 6901)** `"binding":"/path"`로 컴파일한다. 점(`.`) 구분 경로는 슬래시(`/`) 구분 + 선행 슬래시로 변환한다.

| authoring 표기 (L1 템플릿) | emit 결과 (A2UI 컴포넌트) |
|---------------------------|--------------------------|
| `{{bind:"home.score"}}` | `"binding":"/home/score"` |
| `{{bind:"standings.0.pct"}}` | `"binding":"/standings/0/pct"` (또는 `@index`) |
| `{{llm.reaction}}` | `"binding":"/llm/reaction"` — dataModelUpdate `contents`에 `{key:"reaction", value:<LLM 생성 슬롯 텍스트>}` 로 주입 |

- `{{llm.reaction}}` 슬롯도 동일하게 JSON Pointer로 emit하되, **값은 LLM 리액션 텍스트 전용**이며 수치를 포함할 수 없다(OutputGuardrail 재검증).
- emit된 `binding` 값은 항상 선행 슬래시로 시작하는 JSON Pointer여야 한다. Validator는 emit 단계에서 `^/` 정규식으로 형식을 재확인한다.
