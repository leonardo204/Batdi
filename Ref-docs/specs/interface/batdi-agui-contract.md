---
id: batdi-agui-contract
title: 밧디 AG-UI Protocol 통신 계약
type: interface
version: 0.1.0
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

### 2.3 프론트 → 백엔드 (툴 응답)

`useCopilotAction`으로 등록한 프론트 함수 호출 결과를 AG-UI `ToolResult`로 회신. 예:
- `registerFavoritePlayer(playerId)`
- `toggleNotification(type)`
- `openPersonaEditor()`
- `jumpToConversation(id)`

(전체 7종 카탈로그는 [batdi-copilot-actions](./batdi-copilot-actions.md) 참조)
