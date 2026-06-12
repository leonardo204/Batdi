---
id: batdi-a2ui-palette-schema
title: 밧디 A2UI 컴포넌트 팔레트 & JSON Schema
type: interface
version: 1.0.1
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

**4. MVP vs 표준 마이그레이션.** MVP는 CopilotKit 다이얼렉트(`surfaceUpdate` / `dataModelUpdate` / `beginRendering`)를 타깃한다. A2UI 표준 v1.0(`createSurface` / `updateComponents` / ...)이 RC를 졸업하면 마이그레이션 대상이다.

**5. PoC 실측 패키지(2026-06-12, → architecture §13.1).** 프론트 렌더: `@copilotkit/react-core@1.60.0`(`createA2UIMessageRenderer`) + `@copilotkit/a2ui-renderer@1.60.0`(`A2UIRenderer`/`A2UIProvider`/`basicCatalog`). 그래프측 A2UI emit: `@ag-ui/a2ui-toolkit@0.0.2`(`buildA2UIEnvelope`) + `@ag-ui/langgraph@0.0.41`(`getA2UITools`). ⚠️ A2UI emit→render 경로는 LLM 키 필요(PoC 미실증, 후속 스파이크).

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

#### 5.4.1 깊이(depth)·노드(node) 제한 검증 알고리즘

`maxDepth=4` / `maxNodes=30`은 LLM 동적 구조 선택을 통제하는 두 상한이다. 산정 기준을 다음과 같이 명문화한다.

**깊이(depth) 산정 정의**

- A2UI 컴포넌트 트리는 `surfaceUpdate.components`의 인접 리스트로 표현된다. 각 노드는 `id` + `type` + `children`(자식 id 배열)이며, **루트는 `beginRendering.root`가 가리키는 노드**다.
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

> 화이트리스트(허용 `type` 외 차단, §5.4 `ALLOWED_TYPES`)·바인딩 규칙(§5.5) 위반도 **동일한 전체 L1 Template 폴백 경로**를 따른다.

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
