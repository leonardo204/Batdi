---
id: batdi-agui-contract
title: 밧디 AG-UI Protocol 통신 계약
type: interface
version: 1.0.0
status: approved
scope: CopilotKit AG-UI 프로토콜 — 프론트↔백엔드 메시지 시퀀스·이벤트 타입·툴 응답 계약
related: [batdi-architecture]
updated: 2026-06-12
---

## 2. AG-UI Protocol 통신 계약

### 2.0 메시지 시퀀스 (Mermaid)

```mermaid
sequenceDiagram
    participant U as 사용자
    participant C as CopilotKit Provider
    participant R as CopilotRuntime
    participant G as Core LangGraph
    participant P as PostgreSQL
    participant L as Langfuse

    U->>C: 메시지 입력 — 한화 경기 어때
    C->>R: POST /api/copilotkit<br>useCopilotReadable 자동 포함
    R->>G: 그래프 실행 시작
    G-->>C: RunStarted
    C-->>U: TypingIndicator + Intent별 SkeletonCard 사전 렌더 — CLS 0
    G-->>C: StateSnapshot intent 확정

    G->>G: InputGuardrail 통과
    G->>G: IntentRouter — score, general
    G->>P: CacheLookup L0
    P-->>G: MISS

    G->>P: ServiceSubgraph ScoreGraph
    P-->>G: ScoreData
    G->>G: UIComposer L2 Template 선택
    G-->>C: StateSnapshot, StateDelta
    G->>G: UIValidator 통과
    G->>G: DataBinder DB 값 치환
    G->>G: TeamPersona 한화 톤
    G-->>C: A2UIEnvelope<br>surfaceUpdate, dataModelUpdate, beginRendering
    C-->>U: A2UIRenderer 카드 렌더

    G->>R: LLM 호출 Flash 50 tokens
    R-->>C: TextMessageChunk stream
    C-->>U: 리액션 스트리밍 누적
    G->>G: OutputGuardrail 통과
    G-->>C: RunFinished
    C-->>U: TypingIndicator 제거, 입력 활성화

    G->>L: 트레이스 기록<br>노드별 latency, tokens, 비용
    G->>P: agent_traces 저장
```

### 2.1 프론트 → 백엔드 (사용자 메시지)

CopilotKit Provider가 `/api/copilotkit` 엔드포인트에 POST, 본문에 `useCopilotReadable`로 등록된 컨텍스트가 자동 포함.

**자동 주입되는 Readable Context**
- `user.id`, `user.teamId`, `user.level`, `user.persona`
- `personalAgent.profileSummary`
- `session.recentMessages` (최근 20건)
- `currentGame` (실시간 경기 상태, 있을 때만)

### 2.2 백엔드 → 프론트 (AG-UI 메시지 스트림)

| 메시지 타입 | 용도 | 생성자 |
|-----------|------|--------|
| `RunStarted` | 그래프 시작 | LangGraph |
| `StateSnapshot` | Agent 상태 스냅샷 | LangGraph |
| `StateDelta` | 상태 변화 | LangGraph |
| `TextMessageChunk` | LLM 스트리밍 텍스트 | UIComposer |
| `ToolCall` | 프론트 함수 호출 요청 | Agent |
| `A2UIEnvelope` | `surfaceUpdate`/`dataModelUpdate`/`beginRendering` | UIComposer → DataBinder |
| `RunFinished` | 그래프 종료 | LangGraph |

#### 2.2.1 A2UI 골든 샘플 (검증된 3-메시지 JSONL)

CopilotKit `@copilotkit/a2ui-renderer` 다이얼렉트의 검증된 메시지 흐름. 순서는 항상 `surfaceUpdate` → `dataModelUpdate` → `beginRendering`. 아래는 scoreboard 예시.

```jsonl
{"surfaceUpdate":{"surfaceId":"score-1","components":[{"id":"card","type":"card","children":["row"]},{"id":"row","type":"row","children":["home","away"]},{"id":"home","type":"text","binding":"/home/score"},{"id":"away","type":"text","binding":"/away/score"}]}}
{"dataModelUpdate":{"surfaceId":"score-1","path":"/","contents":[{"key":"home","value":{"score":5}},{"key":"away","value":{"score":3}}]}}
{"beginRendering":{"surfaceId":"score-1","root":"card","styles":{"theme":"light"}}}
```

- 컴포넌트 노드: `id` + `type` + `children`(자식 id 배열) + `binding`(JSON Pointer, RFC 6901).
- 데이터: `dataModelUpdate.contents:[{key,value}]`. 값 필드는 `binding`이 가리키는 JSON Pointer로 해석된다.
- 루트: `beginRendering.root`로 지정(`"card"`).
- 바인딩 출처: L1 템플릿 `{{bind:"home.score"}}` → DataBinder가 `"binding":"/home/score"`로 컴파일 (→ [a2ui-palette-schema §5.5.1](./batdi-a2ui-palette-schema.md)).

#### 2.2.2 CopilotKit 렌더러 연결

```tsx
import { CopilotKitProvider } from "@copilotkit/react";
import { createA2UIMessageRenderer } from "@copilotkit/a2ui-renderer";

const a2uiRenderer = createA2UIMessageRenderer({ theme: "light" });

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      renderActivityMessages={a2uiRenderer}
    >
      {children}
    </CopilotKitProvider>
  );
}
```

#### 2.2.3 A2UI 표준 v1.0 RC ↔ CopilotKit 다이얼렉트 대응 (마이그레이션 참조)

MVP는 CopilotKit 다이얼렉트를 타깃한다. A2UI 표준 v1.0(a2ui.org, 현재 Release Candidate — 프로덕션 권장 v0.9.1)이 RC를 졸업하면 아래 대응에 따라 마이그레이션한다.

| A2UI 표준 v1.0 RC 메시지 | CopilotKit 다이얼렉트 | 비고 |
|--------------------------|----------------------|------|
| `createSurface` | `surfaceUpdate` (신규 surface) | 표준은 `"version":"v1.0"` 필드 포함 |
| `updateComponents` | `surfaceUpdate` (components 갱신) | 컴포넌트 인접 리스트 갱신 |
| `updateDataModel` | `dataModelUpdate` | 표준 `{"path","contents"}` ≈ 다이얼렉트 동형 |
| `deleteSurface` | (surface 제거) | MVP 미사용 |
| `actionResponse` | `ToolResult` (AG-UI) | 툴 응답 회신 |
| `callFunction` | `ToolCall` (AG-UI) | 프론트 함수 호출 요청 |
| (표준 루트 id `"root"`) | `beginRendering.root` | 다이얼렉트는 root를 명시 지정 |
| 바인딩 `{"path":"/user/name"}` | `"binding":"/user/name"` | 양쪽 모두 JSON Pointer(RFC 6901) |

### 2.3 프론트 → 백엔드 (툴 응답)

`useCopilotAction`으로 등록한 프론트 함수 호출 결과를 AG-UI `ToolResult`로 회신. 예:
- `registerFavoritePlayer(playerId)`
- `toggleNotification(type)`
- `openPersonaEditor()`
- `jumpToConversation(id)`

(전체 7종 카탈로그는 [batdi-copilot-actions](./batdi-copilot-actions.md) 참조)
