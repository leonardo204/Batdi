---
id: batdi-a2ui-palette-schema
title: 밧디 A2UI 컴포넌트 팔레트 & JSON Schema
type: interface
version: 1.1.0
status: approved
scope: A2UI 화이트리스트 팔레트 — 원자 컴포넌트·야구 도메인 widget 10종·검증(validateA2UIComponents)·데이터 바인딩 규칙. A2UI 표준 포맷(PoC #2 실측) 준거
related: [batdi-architecture, batdi-uiux-guideline]
updated: 2026-06-12
---

## A2UI 준거 (PoC #2 실측 확정)

> **PoC #2(2026-06-12)에서 실제 설치 패키지로 emit→검증→바인딩 해소까지 라이브 통과**한 사실. 이전 버전(1.0.x)은 `surfaceUpdate`/`dataModelUpdate`/`beginRendering` 다이얼렉트를 가정했으나, **실측 렌더 엔진 `@a2ui/web_core`(MessageProcessor) + emit 검증기 `@ag-ui/a2ui-toolkit`(validateA2UIComponents)는 A2UI 표준 포맷을 사용**한다. 표준 포맷을 정본(canonical)으로 채택하고, 본 문서의 envelope 명명·바인딩 규칙을 이에 정합시킨다.

**1. 표준 메시지(op) 3종 — 정본.** 렌더 흐름은 항상 다음 순서다.

```jsonl
{"createSurface":{"surfaceId":"s1","catalogId":"basic"}}
{"updateComponents":{"surfaceId":"s1","components":[{"id":"root","component":"Column","children":["name-field"]},{"id":"name-field","component":"TextField","label":"이름","value":{"path":"/name"}}]}}
{"updateDataModel":{"surfaceId":"s1","path":"/","value":{"name":""}}}
```

- `createSurface{surfaceId, catalogId}` → `updateComponents{surfaceId, components[]}` → `updateDataModel{surfaceId, path:"/", value:{...}}`. (이전 `surfaceUpdate`/`beginRendering` 아님)
- **컴포넌트 키 = `component`** (NOT `type`). `children`은 **자식 id 문자열 배열**. **루트는 반드시 `id:"root"`**.
- **값 슬롯 = `{"path":"/json/pointer"}`** (DataBinding 객체, JSON Pointer RFC 6901 절대경로) 또는 리터럴. 정적 라벨만 리터럴(`"vs"`). 예: `{"id":"homeScore","component":"Text","text":{"path":"/home/score"},"variant":"h2"}`.

**2. 렌더 가능 최소 카탈로그 = 5종.** 실측 `basicCatalog`이 렌더하는 컴포넌트는 **{Text, Row, Column, Button, TextField}**(basicCatalog 전체가 아님). 우리 도메인 widget(§5.3, 10종)은 basicCatalog에 없으므로 **커스텀 카탈로그 등록 대상**이다(→ §5.3 주).

**3. 데이터 주입 = updateDataModel 1 op.** LLM은 **구조 + 바인딩만** emit한다. 실제 값은 `updateDataModel{path:"/", value: DBObject}` 단일 op로 주입되어 바인딩이 해소된다. PoC #2에서 `/home/score → 5`가 **DB에서만** 왔고 LLM 생성이 아님을 실증.

**4. 환각 차단 = 2단 게이트.** PoC #2에서 gemini-2.5-flash는 **적대 입력(유저가 수치를 직접 제시)에도 값을 인라인하지 않고 바인딩을 유지**했다. 유일한 실패모드는 키 드리프트(`component`↔`type`)였고, 프롬프트로 키를 명시하면 교정됐다. 결론: (a) 프롬프트(생성 통제) + (b) `validateA2UIComponents`(결정론 게이트) 2단 — §5.4·§5.5.2.

**5. PoC 실측 패키지(2026-06-12, → architecture §13.1).** 그래프측 A2UI emit 검증: `@ag-ui/a2ui-toolkit`(`validateA2UIComponents`). 렌더 엔진: `@a2ui/web_core`(MessageProcessor). 프론트 렌더 어댑터: `@copilotkit/react-core`(`createA2UIMessageRenderer`) + `@copilotkit/a2ui-renderer`(`A2UIRenderer`/`A2UIProvider`/`basicCatalog`). gemini-2.5-flash로 emit→validateA2UIComponents→바인딩 해소까지 통과 확인.

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

> **A2UI 컴포넌트 모델(표준, PoC #2 실측)**: 각 노드는 `id` + **`component`**(타입 키, NOT `type`) + `children`(자식 id 배열) + 값 슬롯(`text`/`label` 등)에 `{"path":"/json/pointer"}`. **루트는 `id:"root"`**. ⚠️ **렌더 가능 최소 카탈로그는 {Text, Row, Column, Button, TextField} 5종**뿐 — 위 표의 `card`/`badge`/`chip`/`table`/`grid` 등 나머지 원자와 §5.3 도메인 widget은 **커스텀 카탈로그 등록 후** 렌더된다.

### 5.3 야구 도메인 widget

> 표기: 아래 `binding:"/x"`는 표준 값 슬롯 `{"path":"/x"}`를 뜻하고, 컴포넌트 타입 키는 `component`다. **이 10종은 basicCatalog에 없으므로 커스텀 카탈로그(`createA2UICatalog`)에 등록해야 렌더된다** — MVP는 5종 기본 카탈로그(Text/Row/Column/Button/TextField) 조합으로 우선 구현하고 도메인 widget은 점진 등록.

| widget | 필수 바인딩 | A2UI 매핑 (component + 값슬롯 `{path:}`) |
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

### 5.4 검증 (UIValidator)

**검증기는 자체 구현하지 않고 `@ag-ui/a2ui-toolkit`의 `validateA2UIComponents`를 채택**한다(PoC #2 실측). 구조·카탈로그·바인딩 해소를 결정론적으로 검사하고 `unresolved_binding`/`unknown_component`/`missing_component_type` 같은 머신리더블 에러를 반환한다. 우리 UIValidator는 이 검증기 위에 ① 화이트리스트(카탈로그 등록 컴포넌트만) ② 깊이/노드 제한(§5.4.1) ③ 바인딩 강제(§5.5)를 게이트로 얹는다.

```typescript
// updateComponents.components 에 적용 (표준 포맷)
const result = validateA2UIComponents(components, {
  catalog,                 // 등록된 컴포넌트만 허용 (기본 5종 + 커스텀)
  validateBindings: true,  // 모든 {path:} 가 updateDataModel 주입 후 해소되는지
});
// + 추가 게이트: maxDepth=4 / maxNodes=30 (§5.4.1), {{bind}} 강제 (§5.5)
// result 에러 → 재호출 없이 L1 Template 폴백
```

#### 5.4.1 깊이(depth)·노드(node) 제한 검증 알고리즘

`maxDepth=4` / `maxNodes=30`은 LLM 동적 구조 선택을 통제하는 두 상한이다. 산정 기준을 다음과 같이 명문화한다.

**깊이(depth) 산정 정의**

- A2UI 컴포넌트 트리는 `updateComponents.components`의 인접 리스트로 표현된다. 각 노드는 `id` + `component` + `children`(자식 id 배열)이며, **루트는 `id:"root"` 노드**다.
- depth는 루트로부터의 children 중첩 단계로 정의한다. **루트 노드 = 깊이 1**, 루트의 직계 자식 = 깊이 2, 그 자식 = 깊이 3 … 식으로 1씩 증가한다.
- 트리 전체의 depth는 도달 가능한 모든 노드 중 **최대 깊이값**이다. `maxDepth=4`는 이 최대값이 4를 넘으면(즉 깊이 5 노드가 존재하면) 위반이다.

**노드(node) 카운트 정의**

- nodeCount는 **루트에서 children을 따라 도달 가능한 컴포넌트의 총 개수**다(고아 노드는 카운트에서 제외하고 별도 경고 대상).
- 동일 id 중복·순환 참조는 카운트 이전에 트리 무결성 위반으로 즉시 폴백한다(아래 알고리즘의 `visited` 가드).
- `maxNodes=30`은 도달 가능 노드 수가 30을 초과하면 위반이다.

**검증 알고리즘 (BFS, 의사코드)**

```text
function validateTree(components, rootId):
    index   = mapById(components)        # id → node
    visited = {}                         # 순환/중복 가드
    nodeCount = 0
    maxDepthSeen = 0
    queue = [ (rootId, depth=1) ]

    while queue not empty:
        (id, depth) = queue.pop_front()
        if id not in index:        return VIOLATION("dangling child ref")
        if id in visited:          return VIOLATION("cycle or dup id")
        visited.add(id)

        nodeCount += 1
        maxDepthSeen = max(maxDepthSeen, depth)

        # 조기 종료: 한도 초과가 확정되는 즉시 중단
        if depth     > MAX_DEPTH (=4):  return VIOLATION("maxDepth exceeded")
        if nodeCount > MAX_NODES (=30): return VIOLATION("maxNodes exceeded")

        for childId in node.children ?? []:
            queue.push_back( (childId, depth + 1) )

    return OK   # maxDepthSeen ≤ 4 AND nodeCount ≤ 30
```

- depth·nodeCount **둘 중 하나라도** 상한을 초과하면 위반이다(AND 통과만 OK).
- DFS로 구현해도 동일 결과다. depth는 children 진입 시 +1, nodeCount는 방문 시 +1로 동형이다.

**위반 시 처리 — 전체 L1 Template 폴백 (부분 절단 아님)**

depth/node 한도 위반은 §5.4의 폴백 정책과 동일 경로다. 초과 노드만 잘라내는 **부분 절단을 하지 않는다** — 트리 구조가 깨진 채 렌더되는 위험을 피하고 레이턴시를 보장하기 위해, 해당 intent의 **전체 A2UI 페이로드를 폐기하고 L1 기본 Template으로 통째 폴백**한다(LLM 재호출 없음). 위반 페이로드는 §5.4의 `llm_ui_invalid` 이벤트로 Langfuse에 비동기 기록한다.

> 화이트리스트(카탈로그 미등록 `component` 차단, `validateA2UIComponents` `unknown_component`)·바인딩 규칙(§5.5) 위반도 **동일한 전체 L1 Template 폴백 경로**를 따른다.

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

`{{bind:}}`/`{{llm.reaction}}`는 **L1 템플릿 authoring 표기**다. DataBinder가 emit 시 A2UI **값 슬롯 DataBinding 객체** `{"path":"/json/pointer"}`(JSON Pointer RFC 6901)로 컴파일한다. 점(`.`) 구분 경로는 슬래시(`/`) 구분 + 선행 슬래시로 변환한다. 값 자체는 LLM이 만들지 않고 `updateDataModel{path:"/", value}`로 주입된다.

| authoring 표기 (L1 템플릿) | emit 결과 (A2UI 값 슬롯) |
|---------------------------|--------------------------|
| `text: {{bind:"home.score"}}` | `"text": {"path":"/home/score"}` |
| `{{bind:"standings.0.pct"}}` | `{"path":"/standings/0/pct"}` |
| `{{llm.reaction}}` | `{"path":"/llm/reaction"}` — `updateDataModel{path:"/", value}`의 `value.llm.reaction`에 LLM 생성 슬롯 텍스트로 주입 |

- `{{llm.reaction}}` 슬롯도 동일하게 JSON Pointer로 emit하되, **값은 LLM 리액션 텍스트 전용**이며 수치를 포함할 수 없다(OutputGuardrail 재검증).
- emit된 `binding` 값은 항상 선행 슬래시로 시작하는 JSON Pointer여야 한다. Validator는 emit 단계에서 `^/` 정규식으로 형식을 재확인한다.
