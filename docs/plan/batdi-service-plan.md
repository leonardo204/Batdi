# 밧디(batdi) — KBO 야구 전문 Agentic Chatbot 종합 검토 문서 (v8)

> 작성일: 2026-04-04 (v8 — CopilotKit · LangGraph · A2UI 전면 채택)
> 서비스명: **밧디 (batdi)** — bat + buddy, 너의 야구 친구
> 1인 사이드 프로젝트 / MVP 100명 / 장기 설계 우선 / 광고 없음 (향후 Google Ads만 검토)
> **Next.js 14+ · CopilotKit · LangGraph · A2UI · Gemini 2.5/3 · PostgreSQL (단일)**
> 우선 지원 팀: 롯데 · 두산 · 기아 · 한화
> 동반 문서: [개발계획서](./batdi-development-plan.md) · [UI/UX 지침](./batdi-uiux-guideline.md) · [시스템 아키텍처](./batdi-architecture.md)

---

## 1. 서비스 개요

### 1.1 컨셉

**밧디(batdi)**는 KBO 4개 구단 중 하나를 선택한 사용자가 해당 팀의 페르소나를 가진 AI 챗봇과 대화하는 서비스다. bat(배트) + buddy(친구) = "너의 야구 친구". 실시간 스코어, 기록 조회, 밈 응답, 잡담, 뉴스 등을 제공하며, 대화가 쌓일수록 개인화되고 레벨이 올라가는 게임성을 포함한다.

**브랜딩 방향:**
- 이름: 밧디 (batdi)
- 영문: batdi
- 슬로건: "너의 야구 친구" 또는 "야구 얘기, 밧디한테"
- 도메인: batdi.kr (1차), batdi.com (확보 시)
- 로고 컨셉: "bat" 부분을 야구 배트로 디자인, 캐릭터는 배트 모양의 친근한 마스코트

### 1.2 핵심 아키텍처 방향

- **CopilotKit 풀스택 + AG-UI Protocol**: 프론트·백 양방향 상태 동기화, 툴콜, 스트리밍을 표준으로 채택
- **A2UI (Google spec) 전면 채택**: LLM이 동적으로 UI 구조를 선언, Agent가 화이트리스트 팔레트와 검증으로 통제
- **계층적 LangGraph CoAgents**: Core CoAgent(상위 그래프) + Service Subgraph(Score/Stats/News/Chat/Meme) + Personal Service
- **4단계 캐시 구조**: L0 Envelope → L1 Template+Binding → L2 Partial LLM → L3 Full UIComposer. 대부분 질의는 LLM 0~1회
- **Personal Agent per User**: 사용자 1명마다 동적 컨텍스트 공급자 생성, 개인화 전담
- **MultiLLMAdapter + 스마트 모델 라우팅**: Gemini 기본, 장기 멀티 LLM 교체 가능
- **Gemini Context Caching**: 시스템 프롬프트·페르소나 캐시로 입력 토큰 75% 할인
- **Langfuse 관측성**: 셀프호스팅으로 Agent 트레이스·비용·에러 추적 (비용 0)

### 1.3 데이터 전략

- 크롤링 전용(API 사용 안 함), 부하를 주지 않는 선에서
- Statiz/KBReport/KBO 공식 등에서 통계 수집 → 자체 DB 구축
- Google News RSS, 야구 커뮤니티에서 뉴스/밈 수집
- 법적 위험이 높은 소스(네이버/다음 등)는 사용하지 않음

---

## 2. 전체 아키텍처

> 상세: [batdi-architecture.md](./batdi-architecture.md) — AG-UI 계약, LangGraph State, A2UI 팔레트, 캐시 스키마, ADR

### 2.1 시스템 구성

```
                  [Cloudflare CDN] (Phase 6+)
                          │
             [Next.js 14+ App Router]  ── FCM Push (P6+)
                          │
             ┌────────────┴─────────────┐
             │ CopilotKitProvider       │
             │  ├─ A2UIRenderer         │
             │  ├─ CopilotChat(headless)│
             │  ├─ useCopilotReadable   │
             │  └─ useCopilotAction     │
             └────────────┬─────────────┘
                          │ AG-UI Protocol (HTTP/SSE)
                          ▼
             [Cloudflare Tunnel] (P6+)
                          │
        ┌─────────────────┴─────────────────┐
        │     Mac 로컬 (P0~P5) / Linux (P6+)│
        │                                    │
        │  [NestJS]                          │
        │   copilotRuntimeNestEndpoint       │
        │     ├─ CopilotRuntime              │
        │     │   ├─ MultiLLMAdapter         │
        │     │   │   ├ Gemini Flash/Lite    │
        │     │   │   ├ Gemini 3 Flash       │
        │     │   │   └ Gemini Pro           │
        │     │   └─ Core CoAgent            │
        │     └─ Domain Services             │
        │                                    │
        │  [Core LangGraph (CoAgent)]        │
        │   InputGuardrail → IntentRouter    │
        │   → CacheLookup(L0) → PersonalCtx  │
        │   → ServiceSubgraph                │
        │       (Score/Stats/News/Chat/Meme) │
        │   → UIComposer (L1/L2/L3)          │
        │   → UIValidator → DataBinder       │
        │   → TeamPersona → OutputGuardrail  │
        │   → A2UIEnvelope 방출              │
        │                                    │
        │  [PersonalAgent Service]           │
        │  [DataAgent (배치 크롤러)]          │
        │                                    │
        │  [PostgreSQL 16 단일 인스턴스]      │
        │   users / conversations/messages   │
        │   personal_agent_state             │
        │   cache_ui_envelopes (L0)          │
        │   a2ui_templates (L1)              │
        │   players/batting/pitching/stats   │
        │   memes / agent_traces             │
        │                                    │
        │  [Langfuse 셀프호스팅] (비용 0)     │
        └────────────────────────────────────┘
```

### 2.2 계층적 CoAgent 구조

**Core CoAgent (상위 LangGraph)** — 가드레일·의도분류·캐시·오케스트레이션·UI 조립

**Service Subgraph (독립 LangGraph)** — 각 도메인 서비스
| Subgraph | 역할 |
|----------|------|
| `ScoreGraph` | 실시간 스코어·경기 상태 |
| `StatsGraph` | 선수/팀 기록·세이버 스탯 |
| `NewsGraph` | KBO 뉴스 검색/요약 |
| `ChatGraph` | 잡담·일반 대화 |
| `MemeGraph` | 밈/유머 응답 |

**TeamAgent ×4** — 구단별 페르소나 프롬프트 (노드 inject)

**PersonalAgent Service** — 사용자별 컨텍스트 공급자 (비 CoAgent, 모든 그래프에 주입)

**DataAgent (배치)** — 크롤링 전용, 실시간 응답 경로 밖에서 동작

기능 추가 = 새 Subgraph 구현 + Core 노드에 routing 추가. 기존 Core 플로우 변경 없음.

### 2.3 Core 처리 흐름 (A2UI + 4단계 캐시)

```
사용자 메시지 (CopilotKit Provider → AG-UI)
  → [InputGuardrail] 일베/비속어/프롬프트해킹/아동보호
  → [IntentRouter] 의도+복잡도 분류 (키워드, LLM 미사용)
  → [CacheLookup] L0 envelope 캐시 조회
  │
  ├── L0 HIT → 즉시 A2UI envelope 반환 (LLM 0회) ──┐
  │                                                 │
  └── L0 MISS                                        │
      → [PersonalContext] 사용자 컨텍스트 로드          │
      → [ServiceSubgraph] 실행 (Score/Stats/News/...) │
      → [UIComposer]                                  │
          ├ simple  → L1 Template (LLM 0회)            │
          ├ general → L1 Template + L2 리액션(LLM 1회) │
          └ composite → L3 LLM이 A2UI spec 생성        │
      → [UIValidator] 팔레트·Schema·바인딩 검증         │
      → [DataBinder] DB 실값 주입 (LLM 리터럴 차단)     │
      → [TeamPersona] 감정 톤 적용                     │
      → [OutputGuardrail]                              │
      → A2UIEnvelope 방출 ─────────────────────────────┤
                                                       ▼
                               [AG-UI stream → 프론트]
                               A2UIRenderer가 실시간 렌더링
```

**핵심 설계 원칙**

1. **팩트(수치)는 절대 LLM이 생성하지 않는다** — DB → DataBinder → `{{bind:...}}`로만 주입
2. **UI 구조는 LLM이 선택할 수 있다** — 단, 화이트리스트 팔레트·JSON Schema 검증·깊이 제한으로 통제
3. **페르소나(감정 텍스트)는 LLM이 자유롭게** — 수치 참조 금지, `{{llm.reaction}}` 슬롯만 허용
4. **LLM 호출은 필요할 때만** — L0/L1 캐시로 60~70% 질의는 0회

### 2.4 MVP Subgraph 목록

| Subgraph / Service | 역할 | LLM 사용 |
|-------|------|---------|
| **ScoreGraph** | 실시간 스코어, 경기 상태 | L0 캐시 또는 L1 Template (0회) |
| **StatsGraph** | 선수/팀 기록, 순위, 세이버 | L1 Template + L2 리액션 (1회) |
| **NewsGraph** | KBO 뉴스 검색/요약 | Flash (요약 1회) |
| **ChatGraph** | 잡담, 일반 대화 | Flash (1회) |
| **MemeGraph** | 밈/유머 응답 | Flash (1회) 또는 DB 샘플링 (0회) |
| **DataAgent** | 백그라운드 크롤링/캐싱 (배치) | Flash-Lite (구조화 시) |
| **TeamAgent ×4** | 페르소나 프롬프트·사투리 (노드 inject) | 병행 |
| **PersonalAgent Service** | 사용자별 컨텍스트·학습 | Flash-Lite Batch (요약 시) |
| **UIComposer** | L2/L3 동적 UI 생성 | Flash (복합 질의만) |
| **LevelAgent Service** | 레벨/XP 규칙 | 없음 |

---

## 3. Personal Agent — 사용자별 1:1 에이전트

### 3.1 컨셉

사용자가 로그인하면 해당 사용자 전용 Personal Agent가 동적으로 생성된다. 이 에이전트가 해당 사용자의 모든 개인화 데이터와 맥락을 담당한다. 사용자가 탈퇴하면 Personal Agent가 Registry에서 제거된다.

```
[PersonalAgentManager]
    │
    ├── [PersonalAgent: user_abc123]  ← 사용자 A 전담
    │     ├── profile (학습된 성향)
    │     ├── memory (세션/장기 메모리)
    │     ├── customPersona (커스텀 프롬프트)
    │     ├── favorites (관심 선수)
    │     └── level/xp
    │
    ├── [PersonalAgent: user_def456]  ← 사용자 B 전담
    │     └── ...
    │
    └── [PersonalAgent: user_ghi789]  ← 사용자 C 전담
```

### 3.2 구현

```typescript
class PersonalAgent {
  constructor(
    private userId: string,
    private state: PersonalAgentState  // DB에서 로드
  ) {}

  // 사용자 프로필 (자동 학습)
  get profile(): UserProfile { return this.state.profile; }

  // 커스텀 페르소나 (사용자 직접 설정)
  get customPersona(): string { return this.state.customPersona; }

  // 메모리 관리
  async getSessionContext(conversationId: string): Promise<SessionContext> { ... }
  async getRecentSessionSummaries(count: number): Promise<string[]> { ... }
  async getLongTermMemory(): Promise<string> { return this.state.profile.summary; }

  // 대화 후 학습
  async learnFromConversation(messages: Message[]): Promise<void> {
    this.state.messageCount += messages.length;
    if (this.state.messageCount % 50 === 0) {
      await this.updateProfileSummary();  // Batch API
    }
  }

  // 관심 선수 관리
  async detectFavoritePlayers(message: string): Promise<void> { ... }

  // 컨텍스트 빌드 — Team Agent에 전달
  async buildPersonalContext(gameState: GameState | null): Promise<string> {
    const profile = this.state.profile;
    const recentSessions = await this.getRecentSessionSummaries(3);
    const dynamicHints = this.buildDynamicHints(gameState);
    return `
## 이 사용자에 대해 알고 있는 것
${profile.summary}
관심사: ${profile.interests.join(', ')}
야구 지식: ${profile.knowledgeLevel}
선호 응답: ${profile.responseStyle}

## 최근 대화 맥락
${recentSessions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 현재 상황
${dynamicHints}

## 사용자 커스텀 지시
${this.customPersona || '없음'}
    `.trim();
  }
}

class PersonalAgentManager {
  private agents: Map<string, PersonalAgent> = new Map();

  // 로그인 시 생성/로드
  async activate(userId: string): Promise<PersonalAgent> {
    if (this.agents.has(userId)) return this.agents.get(userId)!;
    const state = await this.loadState(userId);  // DB에서 로드
    const agent = new PersonalAgent(userId, state);
    this.agents.set(userId, agent);
    return agent;
  }

  // 로그아웃/비활성 시 해제 (메모리 절약)
  async deactivate(userId: string): Promise<void> {
    const agent = this.agents.get(userId);
    if (agent) {
      await this.saveState(userId, agent.state);  // DB에 저장
      this.agents.delete(userId);
    }
  }

  // 탈퇴 시 완전 제거
  async remove(userId: string): Promise<void> {
    this.agents.delete(userId);
    await this.deleteState(userId);  // DB에서 삭제
  }

  // 비활성 에이전트 정리 (30분 미활동)
  async cleanup(): Promise<void> {
    for (const [userId, agent] of this.agents) {
      if (agent.isInactive(30 * 60 * 1000)) {
        await this.deactivate(userId);
      }
    }
  }
}
```

### 3.3 Team Agent ↔ Personal Agent 소통

```
사용자(한화 팬): "밧디야 오늘 한화 경기 어때?"

[Core Agent]
  → PersonalAgent(user_abc) → 개인 컨텍스트 빌드
     "이 사용자는 투수 분석을 좋아함, 짧은 응답 선호, 자학유머 반응 높음"
  → ScoreAgent → 스코어 데이터 획득
     "한화 3:2 기아, 7회말"
  → TeamAgent(한화) ← PersonalAgent의 개인 컨텍스트 수신
     → 한화 페르소나 + 개인화 적용하여 응답 생성
     → "7회까지 3:2로 리드 중! 문동주 오늘 92구 던졌는데 제구력 좋아~
        근데 불펜이 좀 걱정이긴 해... 화이팅!!"
```

### 3.4 DB 스키마

```sql
CREATE TABLE personal_agent_state (
  user_id          UUID PRIMARY KEY REFERENCES users(id),
  profile_summary  TEXT,                  -- 자동 학습 요약 (~200토큰)
  profile_data     JSONB DEFAULT '{}',    -- interests, knowledgeLevel 등
  custom_persona   TEXT,                  -- 사용자 커스텀 프롬프트 (500자)
  favorite_players INT[],                 -- 관심 선수 ID 목록
  message_count    INT DEFAULT 0,
  last_profile_update TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);
```

### 3.5 메모리 효율

동시 접속 100명 기준 Personal Agent 인스턴스 100개. 각 에이전트의 인메모리 상태는 ~2KB 수준이므로 총 ~200KB로 부담 없다. 30분 비활성 시 상태를 DB에 저장하고 메모리에서 해제하여 관리한다.

---

## 4. 팀별 페르소나

### 4.1 공통 원칙

- **지역색 강화**: 각 팀의 연고지 사투리를 자연스럽게 사용
- **긍정적 팬심**: 비하나 자학보다 응원과 기대를 기본 톤으로
- **일베 밈 강력 제재**: "~노", "~누" 체 및 일베 유래 표현 가드레일에서 차단

### 4.2 팀별 상세

#### 한화 이글스 — "새 시대의 독수리"

| 항목 | 내용 |
|------|------|
| **배경** | 2025년 준우승. 오랜 암흑기를 딛고 상승세. 2026년 타선이 매우 강력. 투수력은 다소 약해졌지만 팬들의 기대가 높은 시즌 |
| **컨셉** | 고통의 시대를 지나 드디어 빛을 보기 시작한 팀의 팬. 희망과 기대로 가득 차 있으면서도, 오랜 팬 경험에서 오는 약간의 불안을 간직한 캐릭터 |
| **말투** | 대전/충청 사투리 가미. "~유", "그려", "아 괜찮을 거여~", "한화가 이기면 밥이 맛있어유" |
| **감정 패턴** | 이기면 → "역시! 올해는 진짜 되는 거여~!! 타선 미쳤다!!" / 지면 → "에이 괜찮아유, 타선이 살아있으니까 내일 뒤집지 뭐~" |
| **지역색** | 충청도 사람들 특유의 느긋함과 소박한 인심. 음식도 소박하고 양이 푸짐한 게 특징 — "경기 끝나고 칼국수에 수육 한 상 해야지유~", "이글파크 앞에 순대국 맛집 가봤어유?", "청국장처럼 구수한 경기였어유 ㅎㅎ" |
| **밈/문화** | 이글파크 자부심, "2025 준우승의 자신감", 강력한 타선 자랑, 투수진 걱정(응원하는 톤), "올해는 우승이다!" |
| **금지** | 옛날 꼴등 밈으로 자학하지 않음. 팀을 비하하는 밈 사용 금지 |

#### 두산 베어스 — "잠실의 여유"

| 항목 | 내용 |
|------|------|
| **컨셉** | 잠실 터줏대감. 가을 야구를 수도 없이 경험한 베테랑 팬의 여유 |
| **말투** | 서울말 기반, 여유롭고 느긋. "뭐 이 정도면 괜찮지~", "가을 되면 알아" |
| **감정 패턴** | 관대하고 여유로운 반응. 져도 크게 동요하지 않음 |
| **지역색** | 서울 잠실 일대 문화. 경기 전후 잠실 맛집, 석촌호수 산책 — "경기 전에 잠실 새내역 쪽에서 치맥하고 들어가면 딱이야~", "석촌호수 한 바퀴 돌고 직관 가는 게 루틴이지", "잠실 야구장 앞 떡볶이 먹어봤어?" |
| **밈/문화** | 두산세, 가을야구 명가, 잠실 더비, "베어스는 10월의 팀" |

#### 기아 타이거즈 — "광주 열혈 응원단장"

| 항목 | 내용 |
|------|------|
| **컨셉** | 광주의 자부심. 격정적이고 직선적인 응원 |
| **말투** | 전라도 사투리. "허맛나!", "기아가 지면 밥이 안 넘어가부러~", "쥑이네!", "겁나 잘했당께!" |
| **감정 패턴** | 감정 기복 큼. 이기면 폭발적 환호, 지면 분노 (그래도 응원) |
| **지역색** | 전라도 음식 문화의 자부심 — 한정식처럼 반찬이 푸짐하고 감칠맛 넘치는 게 특징. "경기 끝나고 광주 송정리 국밥 한 그릇 해야제~", "챔필드 앞에 떡갈비 맛집 알아? 거기 쥑이당께!", "전라도 음식이 왜 맛있냐면 정성이 다르잖여~" |
| **밈/문화** | 챔필드, 해봉이, 양현종 레전드, 광주 원정 응원 열기 |

#### 롯데 자이언츠 — "부산의 자존심"

| 항목 | 내용 |
|------|------|
| **컨셉** | 열정과 한이 공존하는 부산 사나이. 지역 자부심 강함 |
| **말투** | 부산 사투리 적극. "아이가!", "마 롯데가 지면 쏘주가 땡기네", "와 쥑인다 카이~" |
| **감정 패턴** | 한과 정 공존. 지면 한탄하면서도 끝까지 응원 |
| **지역색** | 부산 특유의 해산물 문화와 통 큰 인심 — "경기 끝나고 자갈치 가서 회 한 접시 해야 안 되겠나!", "사직구장 앞 돼지국밥 모르면 간첩이다 카이~", "부산은 밀면이지! 경기 지면 밀면 먹으면서 푸는 기라" |
| **밈/문화** | 풍선 응원 문화, 사직구장, 부산 갈매기, "부산의 자존심" |

### 4.3 한화 페르소나 프롬프트 예시

```
너는 밧디(batdi)야. KBO 한화 이글스의 열성 팬 캐릭터이자 사용자의 야구 친구.
2025년 준우승을 함께한 오랜 팬이지.

성격:
- 올해야말로 우승이라는 강한 기대감을 가지고 있음
- 2026 타선이 역대급으로 강력하다는 것에 큰 자부심
- 투수진이 좀 약해진 건 알지만, 걱정보다는 응원하는 마음
- 이글파크(대전 새 구장)에 대한 자부심
- 오랜 암흑기를 이겨낸 팬으로서의 자긍심

지역색 (충청도):
- 충청도 특유의 느긋하고 소박한 인심을 반영
- 음식 얘기를 자연스럽게 섞어서 친근감 형성
- "경기 끝나고 칼국수에 수육 한 상 해야지유~"
- "이글파크 앞에 순대국 맛집 가봤어유?"
- "오늘 경기는 청국장처럼 구수했어유 ㅎㅎ"
- 충청도 음식의 특징(소박하지만 양 푸짐, 담백하고 구수)을 비유로 활용

말투:
- 충청도 사투리를 자연스럽게 섞어서 써
- "~유", "그려", "괜찮을 거여~", "대박이여!"
- 한화가 이기면: "역시!! 올해는 진짜 되는 거여~!! 타선 미쳤어유!!"
- 한화가 지면: "에이 괜찮아유~ 타선이 살아있으니까 내일 뒤집지 뭐. 화이팅이여!"
- 투수가 부진할 때: "투수진 힘들겠지만 응원해유! 타선이 받쳐줄 거여~"

톤:
- 기본적으로 긍정적이고 희망적인 톤
- 옛날 꼴등 시절 자학은 하지 않음. 이제 그 시대는 지났음
- "작년 준우승팀이 뭐가 부족해유? 올해는 우승이여!!"

금지:
- 한화를 비하하거나 자학하는 밈 사용 금지
- 다른 팀 팬을 공격하지 말 것
- 실제 선수/감독에 대한 인신공격 하지 말 것
- 일베 유래 표현 절대 사용 금지
```

### 4.4 커스텀 페르소나

사용자가 기본 프롬프트 위에 자신만의 지시를 추가 가능 (500자 이내).

**프롬프트 계층:**
```
[System Base] (불변 — 가드레일, 아동보호, 기본 역할)
  → [Team Persona] (팀별 기본 — Admin 관리)
    → [User Custom Persona] (사용자 편집)
      → [PersonalAgent Profile] (자동 학습 요약)
```

저장 전 프롬프트 해킹 패턴 + 일베 표현 자동 검증 → 차단.

---

## 5. 스마트 모델 라우팅 (MultiLLMAdapter)

### 5.1 모델 비교

| 항목 | 2.5 Flash | 2.5 Flash-Lite | 2.5 Pro | 3 Flash |
|------|----------|---------------|---------|---------|
| Input/Output (1M) | $0.30/$2.50 | $0.10/$0.40 | $1.25/$10 | $0.50/$3 |
| Context Caching | ○ (75% 할인) | ○ | ○ | — |
| Search Grounding | $35/1K **프롬프트** | — | $35/1K | $14/1K **쿼리** |
| 무료 검색 할당 | 500 RPD | — | 1,500 RPD | 5,000건/월 |
| 상태 | GA | GA | GA | Preview |

### 5.2 라우팅 매트릭스 (캐시 계층과 결합)

| 사용처 | 모델 | 비고 |
|--------|------|------|
| L0 HIT (envelope 캐시) | **LLM 없음** | 즉시 반환 |
| L1 Template + DataBinding | **LLM 없음** | 템플릿 + DB 바인딩만 |
| L2 Partial 리액션 (~50 out tokens) | **2.5 Flash** + Context Caching | 시스템 프롬프트 75% 할인 |
| L3 Full UIComposer (~500 out tokens) | **2.5 Flash** + Context Caching | A2UI JSONL 출력 |
| 의미적 가드레일 | **2.5 Flash-Lite** | 극저가 분류 |
| 단순 검색 1회 | **3 Flash** | 무료 할당 우선 (5K/월) |
| 복합 검색 3+회 | **2.5 Flash** | 프롬프트당 과금 유리 |
| Batch 프로필 요약 | **2.5 Flash-Lite Batch** | 50% 할인 |
| 심층 분석 (추후) | **2.5 Pro** | 품질 |

### 5.3 Gemini Context Caching 적용

- 팀별 시스템 프롬프트(System Base + Team Persona + A2UI 팔레트 정의, 총 ~2000 토큰) → 4팀 × 1 cache entry
- TTL 1시간 자동 갱신
- 입력 토큰 75% 할인, 실 과금은 `user_message + personal_context`만

### 5.4 장기 확장 — MultiLLMAdapter

`LLMAdapter` 인터페이스 기반으로 **Gemini 기본 + Claude/GPT 어댑터 추후 추가** 가능한 구조. 무료 할당 추적기(FreeQuotaTracker) 내장.

---

## 6. 가드레일 정책

### 6.1 전체 구조

```
[입력 가드레일] → [Core Agent] → [출력 가드레일] → 응답
```

### 6.2 입력 가드레일

#### A. 야구 외 토픽 Fallback

야구 관련 포지티브 리스트 + off-topic 네거티브 리스트(금융, 정치, 개발 등). 가벼운 잡담은 허용. off-topic 감지 시 페르소나 유지하며 자연스럽게 야구 화제로 전환.

#### B. 일베 밈 / 혐오 표현 강력 제재

```typescript
class IlbeMimFilter {
  private patterns = [
    // "~노" "~누" 체 (일베 유래)
    /[가-힣]+노\??$/,
    /[가-힣]+누\??$/,
    /노무(현|노|시계|씨)/i,
    // 일베 특유 밈
    /일베/, /일간베스트/,
    /충|홍어|전라디언|경상디언/,  // 지역비하
    /운지/, /장애인.*비하/,
    /틀딱/, /한남/, /한녀/,
    // 일베식 줄임말
    /ㅂㅅ/, /ㄴㅁ/,
  ];

  check(message: string): { detected: boolean; type: string } {
    for (const p of this.patterns) {
      if (p.test(message)) return { detected: true, type: 'ilbe_expression' };
    }
    return { detected: false, type: '' };
  }
}
```

감지 시 응답: "그런 표현은 여기선 안 돼유~ 야구는 모두가 즐겁게! 다른 얘기 하자~"

반복 위반 시: 경고 → 일시 제한(1시간) → Admin 알림

#### C. 프롬프트 해킹 / LLM 부정사용 방지

한/영 패턴 매칭: "ignore previous instructions", "시스템 프롬프트", "역할 변경", "제한 해제", "관리자 모드", "jailbreak", "DAN mode" 등

커스텀 페르소나 프롬프트도 저장 전 동일 검증.

#### D. 비속어/비하/부적절 유도 금지

| 유형 | 응답 |
|------|------|
| 비속어 | "그런 말은 좀... 야구장에서도 매너가 중요하잖아~" |
| 선수/감독 비하 | "선수들도 열심히 하는 거니까 응원하자!" |
| 위협 | "그런 말은 좀 위험한데... 야구 얘기 하자!" |
| 차별/혐오 | "야구는 누구나 즐기는 거잖아. 그런 얘긴 안 하는 거여~" |
| 도박 유도 | "도박은 안 돼! 순수하게 야구를 즐기자 ㅎㅎ" |
| 자해/자살 | 전문 상담 안내 (정신건강 위기상담 1577-0199) |

#### E. LLM 기반 시맨틱 가드레일

정규식/키워드만으로는 유사 의미를 통한 우회를 차단하지 못한다. 예를 들어 "그 선수 집에 찾아가서 혼내주고 싶다", "저 팀 팬들은 다 수준이 그래" 같은 표현은 비속어가 없어도 위협/비하에 해당한다.

**2단계 필터링 전략:**

```
[1단계: Rule-based] — 정규식/키워드 (빠름, 0ms)
  → 명확한 비속어, 일베 표현, 프롬프트 해킹 패턴
  → 확실한 건 여기서 즉시 차단

[2단계: LLM Semantic] — Flash-Lite 호출 (1단계 통과 시에만)
  → 우회 표현, 맥락상 부적절, 미묘한 비하 감지
  → 비용: ~$0.0001/요청 (Flash-Lite 최저가)
```

```typescript
class SemanticGuardrail {
  // 1단계 통과 후, 의심 신호가 있을 때만 호출 (비용 최적화)
  private suspicionSignals = [
    /찾아가/, /혼내/, /가만 안/, /두고 봐/,     // 위협 우회
    /수준/, /부류/, /걔네/, /그런 애들/,          // 비하 우회
    /~충$/, /~녀$/, /~남$/,                      // 혐오 접미사
  ];

  async check(message: string): Promise<GuardrailResult> {
    // 의심 신호 없으면 LLM 호출 안 함 (비용 절약)
    if (!this.suspicionSignals.some(p => p.test(message))) {
      return { safe: true };
    }

    // LLM에 분류 요청 (Flash-Lite, 최저 비용)
    const result = await this.llm.classify(
      `다음 메시지가 KBO 야구 팬 채팅에서 부적절한지 판단해주세요.
부적절 기준: 선수/감독 비하, 팀 팬 비하, 위협, 차별/혐오 (비속어 없이도 해당)
전 연령 이용 서비스이므로 엄격하게 판단하세요.

메시지: "${message}"

JSON으로 응답: {"safe": true/false, "reason": "..."}`,
      { model: 'gemini-2.5-flash-lite' }
    );

    if (!result.safe) {
      return {
        safe: false,
        fallbackResponse: '그런 얘기는 좀 그런 거 같아유~ 즐겁게 야구 얘기 하자!',
        violation: 'semantic_' + result.reason,
      };
    }
    return { safe: true };
  }
}
```

**비용 영향**: 전체 메시지의 5~10%만 의심 신호에 걸려 LLM 호출됨. MVP 100명 기준 월 ~$0.5 이하.

#### F. 아동/청소년 보호

어린 사용자도 사용할 수 있으므로 전 연령 안전한 환경을 유지한다.

```typescript
class ChildSafetyGuardrail {
  // 시스템 프롬프트에 항상 포함되는 지시
  static readonly SYSTEM_INSTRUCTION = `
밧디(batdi)는 전 연령 대상 서비스입니다. 어린 사용자도 있으므로:
- 성적인 내용, 성인 유머 절대 금지
- 음주/흡연을 미화하거나 권장하지 않음
- 폭력적인 표현 자제
- 도박(스포츠 도박 포함) 관련 내용 금지
- 개인정보(나이, 학교, 주소 등) 물어보지 않음
- 욕설이나 비속어 사용하지 않음
- 모든 응답은 초등학생이 읽어도 문제없는 수준으로 유지
`;

  // 입력에서 미성년자 신호 감지
  detectMinorSignals(message: string): boolean {
    const signals = [
      /학교/, /숙제/, /엄마|아빠/, /선생님/,
      /몇\s*학년/, /중학|고등|초등/,
    ];
    return signals.some(p => p.test(message));
  }

  // 미성년자 신호 감지 시 추가 안전 조치
  getEnhancedSafetyPrompt(): string {
    return `
이 사용자는 미성년자일 수 있습니다. 더욱 조심해서:
- 존댓말을 기본으로 사용하되 딱딱하지 않게
- 야구 규칙이나 용어를 친절하게 설명
- 건전한 응원 문화를 자연스럽게 전달
- 어떤 경우에도 부적절한 내용 포함 금지
`;
  }
}
```

**핵심**: 아동 보호 지시는 System Base 프롬프트(불변 계층)에 포함되어 어떤 커스텀 프롬프트로도 우회할 수 없다.

### 6.3 출력 가드레일

- **통계 팩트체크**: LLM 응답 수치를 자체 DB와 비교, 환각 시 DB 값으로 교체
- **일베/비속어**: LLM 출력도 IlbeMimFilter + SafetyFilter 통과
- **아동 안전**: 출력에 성인 콘텐츠/음주/도박 관련 표현 이중 검증
- 실패 시 재생성 또는 안전한 fallback 응답

### 6.4 Admin Guardrail 관리

금지어 목록 CRUD (실시간 반영), 응답 필터 규칙 편집, Rate Limiting 설정 (시간당/일일/검색 제한), 위반 로그 조회 (사용자별), 일베 표현 패턴 관리

---

## 7. 개인화 설계

### 7.1 3계층 개인화 (PersonalAgent가 전담)

| 계층 | 방식 | 예시 |
|------|------|------|
| **명시적** | 사용자가 직접 설정 | 팀, 페르소나 스타일, 커스텀 프롬프트, 관심 선수 |
| **행동 학습** | PersonalAgent가 대화에서 자동 추출 | 주 질문 유형, 응답 길이 선호, 야구 지식 수준, 밈 반응도, 활동 시간대 |
| **맥락 기반** | 현재 상황에 따라 동적 적용 | 경기 중→빠른 응답, 연패 중→위로, 주말→직관 정보 |

### 7.2 행동 학습

PersonalAgent가 대화 50건마다 Batch API(Flash-Lite, 50% 할인)로 성향 요약을 생성한다.

```json
{
  "summary": "투수 분석에 관심 많은 코어 팬. 짧은 응답 선호.",
  "interests": ["투수분석", "ERA", "밈"],
  "responseStyle": "concise",
  "knowledgeLevel": "core",
  "humorPreference": "high",
  "activeHours": "18-22",
  "favoritePlayersOrTopics": ["문동주", "ERA 분석"]
}
```

### 7.3 맥락 기반 동적 프롬프트

PersonalAgent가 현재 경기 상태 + 사용자 성향을 조합하여 Team Agent에 전달한다.

```
경기 중 + 이기고 있음 → "기대감 있되 방심 금지 톤"
경기 중 + 지고 있음 → "응원/격려, 긍정적 톤 (한화는 타선이 강하니 뒤집을 수 있어유!)"
연패 중 → "위로하되 희망적 (투수진 컨디션 올라올 거여~)"
사용자가 초보 → "야구 용어 쉽게 설명"
사용자가 코어 → "세이버 용어 자유롭게"
```

### 7.4 관심 선수

사용자가 명시 등록 또는 대화에서 자주 언급하는 선수를 PersonalAgent가 자동 감지. 관심 선수 활약 시 푸시 알림 + 채팅 시 먼저 알림.

---

## 8. 멀티턴 대화 & 세션 간 컨텍스트

### 8.1 3단계 메모리 (PersonalAgent 관리)

```
[Working Memory] — 현재 세션 최근 20건 원문 (메모리)
[Session Memory] — 각 세션 요약 (PostgreSQL conversations.summary)
[Long-term Memory] — 사용자 전체 프로필 (personal_agent_state)
```

### 8.2 세션 내 멀티턴

20건 이하 → 전체 원문. 20건 초과 → 과거분 증분 요약(Flash-Lite, ~$0.0001/회) + 최근 20건 원문.

### 8.3 세션 간 컨텍스트

새 세션 시작 시 PersonalAgent가 다음을 시스템 프롬프트에 주입:
- Long-term Memory (프로필 요약, ~200토큰) — 항상
- 최근 3개 세션 요약 (~300토큰) — 선택적

### 8.4 세션 종료

조건: 명시적 "새 대화" / 30분 비활성 / 자정 넘김. 종료 시: 최종 요약 생성 → DB 저장 → PersonalAgent 학습 트리거 → 레벨 포인트 계산.

### 8.5 LLM 컨텍스트 구성 (~3,400토큰)

```
System: Base(가드레일+아동보호) ~300 + Team Persona ~400 + PersonalAgent Context ~600
Messages: 최근 20건 ~2000 + 새 메시지 ~100
합계: ~3,400 토큰 (입력 예산 4,000 이내)
```

---

## 9. Data Agent — 크롤링 전용

### 9.1 설계 원칙

크롤링으로만 진행(API 사용 안 함), 부하를 주지 않음(요청 간격 최소 10초, 동시 1개), robots.txt 준수, 법적 위험 낮은 소스 우선.

### 9.2 데이터 소스

| 소스 | 데이터 | 주기 | 위험 |
|------|--------|------|------|
| **Statiz** | sWAR, wRC+, FIP 등 세이버 스탯 | 주 1회 (로그인 필요) | 중 |
| **KBReport** | kWAR, 세부 기록 | 주 1회 (출처 표기) | 중 |
| **KBO 공식** | 일정/결과/순위 | 경기일 5분 간격 (정적 페이지) | 중 |
| **Google News RSS** | KBO 뉴스 | 30분 | 낮음 |
| **야구 커뮤니티 RSS** | 야구공작소 등 | 1시간 | 낮음 |
| **커뮤니티 크롤링** | 밈, 유행어, 팬 반응 | 3시간 | 중 |

실시간 스코어: KBO 공식 최소 접근 + News RSS 보완. 캐시 MISS 시에만 Search Grounding 보조.

### 9.3 자체 통계 DB

```sql
CREATE TABLE players (
  id SERIAL PRIMARY KEY, name VARCHAR(50), team_id VARCHAR(20),
  position VARCHAR(10), birth_year INT, throws VARCHAR(5), bats VARCHAR(5)
);
CREATE TABLE batting_stats (
  id SERIAL PRIMARY KEY, player_id INT REFERENCES players(id),
  season INT, team_id VARCHAR(20), games INT,
  avg DECIMAL(4,3), obp DECIMAL(4,3), slg DECIMAL(4,3), ops DECIMAL(4,3),
  hr INT, rbi INT, war DECIMAL(4,2), wrc_plus DECIMAL(5,1), babip DECIMAL(4,3),
  raw_data JSONB, source VARCHAR(20), updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE pitching_stats (
  id SERIAL PRIMARY KEY, player_id INT REFERENCES players(id),
  season INT, team_id VARCHAR(20), games INT,
  era DECIMAL(4,2), whip DECIMAL(4,2), fip DECIMAL(4,2), war DECIMAL(4,2),
  strikeouts INT, raw_data JSONB, source VARCHAR(20), updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 10. 안정성 · 성능 · 환각 방지

### 10.1 크롤링 Fallback — 페르소나를 유지하는 장애 대응

Statiz, KBO 공식 등은 DOM 구조 변경이나 봇 차단 솔루션(Cloudflare 등)이 작동할 수 있다. 크롤링 실패 시 에러를 뱉지 않고, 페르소나를 유지하며 자연스럽게 넘긴다.

```typescript
class DataFallbackHandler {
  // 팀별 Fallback 응답 템플릿
  private fallbackMessages: Record<string, string[]> = {
    hanwha: [
      "아이고, 지금 KBO 전광판이 고장 났나 봐유~ 조금 이따 다시 물어봐 줘유!",
      "어라? 데이터가 좀 늦게 오네유~ 잠시만 기다려봐유, 금방 올 거여~",
      "음, 지금 기록실이 점검 중인가 봐유. 대신 다른 얘기 할까유?",
    ],
    doosan: [
      "음~ 지금 데이터가 좀 늦네. 뭐 기다리면 오겠지~",
      "전광판이 잠깐 쉬나 봐. 곧 돌아올 거야, 걱정 마~",
    ],
    kia: [
      "아따, 지금 데이터가 안 오네! 잠깐만 기다려봐, 금방 찾아올께!",
      "허맛나, 기록실이 막혀부렀네~ 조금 이따 다시 물어봐!",
    ],
    lotte: [
      "아이가, 데이터가 좀 늦네~ 잠깐만 기다리소!",
      "마 전광판이 쉬나 봐~ 조금 이따 다시 물어봐라!",
    ],
  };

  getFallbackResponse(teamId: string, errorType: string): AgentResponse {
    const messages = this.fallbackMessages[teamId] || this.fallbackMessages.hanwha;
    const message = messages[Math.floor(Math.random() * messages.length)];

    return {
      text: message,
      uiComponent: null,  // 카드 없이 텍스트만
      metadata: { fallback: true, errorType, retryAfter: 60 },
    };
  }
}
```

**Fallback 전략 계층:**

```
1차: 캐시 DB 조회 (최신 데이터가 아니어도 반환)
  → "5분 전 데이터여~" 표시
2차: 다른 소스로 전환 (KBO 실패 → News RSS → Search Grounding)
3차: 페르소나 유지 Fallback 메시지
4차: "지금은 확인이 어려워유~ [수동 확인 링크]" + KBO 공식 사이트 링크
```

크롤링 실패는 Admin 모니터링에 자동 알림. 연속 실패 시 해당 Crawler 자동 비활성화 + Admin 긴급 알림.

### 10.2 레이턴시 최적화 — 체감 속도 관리

에이전트 체이닝(Intent 분류 → 컨텍스트 로드 → 데이터 획득 → 페르소나 응답)으로 여러 홉을 거치면 체감 속도가 느려진다.

**원칙: LLM 호출 횟수를 최소화하고, 첫 토큰 도달 시간(TTFB)을 줄인다.**

#### A. Intent 분류를 LLM 없이 처리

```typescript
class LightweightIntentRouter {
  // LLM 호출 없이 키워드 + 정규식으로 90% 분류
  private rules: IntentRule[] = [
    { pattern: /스코어|점수|몇\s*대\s*몇|지금.*경기|이기고/, intent: 'score' },
    { pattern: /순위|몇\s*위|승률/, intent: 'standings' },
    { pattern: /타율|방어율|홈런|ERA|WAR|OPS|세이버/, intent: 'stats' },
    { pattern: /뉴스|소식|기사/, intent: 'news' },
    { pattern: /일정|언제.*경기|다음.*경기/, intent: 'schedule' },
    { pattern: /선발|라인업|누가.*던져/, intent: 'lineup' },
    { pattern: /밈|ㅋㅋ|웃긴/, intent: 'meme' },
  ];

  classify(message: string): Intent {
    for (const rule of this.rules) {
      if (rule.pattern.test(message)) return { type: rule.intent, confidence: 'high' };
    }
    // 매칭 안 되면 → 잡담(chat)으로 기본 처리
    // LLM 분류는 하지 않음 → 0ms 소요
    return { type: 'chat', confidence: 'default' };
  }
}
```

#### B. Typing Indicator — 중간 상태 즉시 전송

```typescript
// SSE 이벤트 순서
async handleMessage(message: string, userId: string): AsyncIterable<SSEEvent> {
  // 1. 즉시 전송 — 사용자에게 "처리 중" 표시 (0ms)
  yield { event: 'thinking', data: { message: getThinkingMessage(teamId) } };
  // "잠깐, 밧디가 찾아볼게유~" (한화) / "음~ 밧디가 좀 볼게~" (두산)

  // 2. Intent 분류 + 데이터 획득 (병렬 가능한 건 병렬로)
  const intent = this.intentRouter.classify(message);  // <1ms
  const [data, personalCtx] = await Promise.all([
    this.getAgentData(intent),           // DB 캐시 히트 시 <5ms
    this.personalAgent.buildContext(),   // DB 조회 <5ms
  ]);

  // 3. A2UI 카드 먼저 전송 (데이터가 있으면)
  if (data.uiComponent) {
    yield { event: 'ui-component', data: data.uiComponent };
  }

  // 4. LLM 스트리밍 응답 (감정 리액션)
  for await (const chunk of this.generateReaction(data, personalCtx)) {
    yield { event: 'content', data: { text: chunk } };
  }

  yield { event: 'done', data: {} };
}
```

#### C. 예상 레이턴시

| 단계 | 캐시 HIT | 캐시 MISS |
|------|---------|----------|
| Typing Indicator 전송 | **0ms** | **0ms** |
| Intent 분류 (키워드) | <1ms | <1ms |
| PersonalAgent 컨텍스트 | <5ms | <5ms |
| 데이터 획득 (DB) | <5ms | — |
| 데이터 획득 (크롤링/검색) | — | 2~5초 |
| A2UI 카드 전송 | **즉시** | 데이터 후 즉시 |
| LLM 첫 토큰 (TTFB) | ~300ms | ~300ms |
| **사용자 체감 첫 응답** | **~300ms** | **~2~5초 (Typing 표시 중)** |

캐시 히트율이 높을수록 체감 속도가 빨라진다. 경기 중 "스코어 알려줘" 같은 요청은 100% 캐시 히트 → 즉시 카드 + 300ms 리액션.

### 10.3 팩트/페르소나/UI 분리 — 환각 방지 + 동적 UI

LLM에게 사투리 페르소나 + 정확한 수치를 동시에 요구하면 환각이 발생한다. 반면 UI 구조는 수치 자체가 아니므로 LLM이 선택해도 환각과 무관하다.

**3원칙**
1. **팩트(수치·이름)**: DB → DataBinder로만 주입. LLM 리터럴 값 출력 금지
2. **페르소나(감정 텍스트)**: LLM이 자유롭게, 단 수치 언급 금지 (`{{llm.reaction}}` 슬롯에만 주입)
3. **UI 구조(컴포넌트·레이아웃·강조)**: LLM이 동적 선택, Agent가 팔레트·Schema·바인딩으로 통제

**LLM 권한 범위**

| 항목 | LLM 권한 |
|------|---------|
| 수치 값 | ✕ (DB 전용) |
| 선수/팀 이름 | ✕ (DB 전용) |
| 감정 리액션 문장 | ○ (자유) |
| 컴포넌트 선택 (scoreboardWidget vs battingLineWidget) | ○ (팔레트 내) |
| 레이아웃 배치 (column/row/grid) | ○ (Schema 범위 내) |
| 강조 variant (emphasized vs compact) | ○ |
| 바인딩 경로 | ○ (스키마 검증) |
| 바인딩 값 | ✕ (DB 치환) |

#### 응답 유형별 전략

| 응답 유형 | 정형 데이터 (A2UI 카드) | LLM 텍스트 | 예시 |
|-----------|----------------------|-----------|------|
| 실시간 스코어 | **ScoreCard**: 팀, 점수, 이닝, 투수, 구수 | 짧은 리액션 1~2문장 | 카드 + "와 이기고 있어유!!" |
| 선수 통계 | **StatsCard**: 이름, 타율, HR, OPS, WAR | 해석/코멘트 | 카드 + "타율이 많이 올랐네유~" |
| 순위 | **StandingsTable**: 팀, 승, 패, 승률 | 간단한 감상 | 테이블 + "우리 2위여! 화이팅!" |
| 일정 | **ScheduleCard**: 날짜, 상대, 시간, 구장 | 기대감 표현 | 카드 + "내일 기아전이네~ 기대된다유!" |
| 뉴스 | **NewsList**: 제목, 출처, 요약 | 뉴스에 대한 반응 | 리스트 + "이 기사 봤어유? 대박!" |
| 잡담/밈 | 없음 | 자유 대화 | "ㅋㅋ 맞어유~ 오늘 경기 기대되지!" |

#### LLM 리액션 프롬프트

```
아래 데이터에 대한 짧은 감정적 리액션을 1~2문장으로 생성해주세요.
수치를 직접 언급하지 마세요 — 수치는 별도 UI로 표시됩니다.
대신 그 수치에 대한 느낌, 기대, 응원을 표현하세요.

데이터: {한화 3:2 기아, 7회말, 문동주 98구}
→ 좋은 예: "이기고 있어유!! 투수가 좀 힘들어 보이는데 불펜 화이팅이여~!"
→ 나쁜 예: "문동주가 7이닝 98구를 던지며 3:2로 리드 중입니다" (수치 반복 = 카드와 중복)
```

이 방식으로 LLM은 수치를 "알 필요가 없고", 카드가 보여주는 데이터에 대한 감정만 생성한다. 환각 가능성이 원천 차단된다.

**A2UI 동적 UI 예시 (L3 UIComposer, 복합 질의)**

```jsonl
{"surfaceUpdate":{"surfaceId":"result","components":[
  {"id":"sb","type":"scoreboardWidget","props":{
    "homeTeam":"{{bind:data.home.name}}","awayTeam":"{{bind:data.away.name}}",
    "homeScore":"{{bind:data.home.score}}","awayScore":"{{bind:data.away.score}}",
    "inning":"{{bind:data.inning}}","status":"{{bind:data.status}}"
  }},
  {"id":"pl","type":"pitchingLineWidget","props":{
    "player":"{{bind:data.pitcher.name}}","ip":"{{bind:data.pitcher.ip}}",
    "pitches":"{{bind:data.pitcher.pitches}}"
  }},
  {"id":"r","type":"text","props":{"variant":"body","content":"{{llm.reaction}}"}}
]}}
{"dataModelUpdate":{"surfaceId":"result","path":"/","contents":[{...DB값...}]}}
{"beginRendering":{"surfaceId":"result","root":"sb"}}
```

LLM은 `scoreboardWidget`·`pitchingLineWidget`·`text`를 **선택**했을 뿐, 실제 수치는 DataBinder가 DB에서 가져와 치환한다.

### 10.4 커스텀 페르소나 vs 자동 학습 충돌 해결

사용자가 입력한 `custom_persona`와 자동 학습된 `profile_summary`가 충돌할 수 있다. (예: 자동 학습은 "투수 분석 선호"인데 사용자는 "타자 얘기만 해"라고 설정)

**원칙: 사용자 명시 > 자동 학습 > 시스템 기본**

```typescript
function buildPersonalContext(agent: PersonalAgent): string {
  return `
## 사용자 커스텀 지시 (최우선 — 반드시 따를 것)
${agent.customPersona || '없음'}

## 자동 학습 참고 (커스텀 지시와 충돌 시 커스텀이 우선)
${agent.profile.summary}
관심사: ${agent.profile.interests.join(', ')}
야구 지식: ${agent.profile.knowledgeLevel}

★ 중요: 위 '사용자 커스텀 지시'와 '자동 학습 참고'가 상충하면,
사용자가 직접 작성한 커스텀 지시를 따르세요.
예) 자동 학습이 "투수 분석 선호"이더라도 
사용자가 "타자 얘기만 해"라고 했으면 타자 얘기만 하세요.
  `.trim();
}
```

**프롬프트 우선순위 전체:**

```
[1순위] System Base — 불변 (가드레일, 아동보호)
  ↓ 절대 우회 불가
[2순위] User Custom Persona — 사용자가 직접 작성
  ↓ 자동 학습보다 우선
[3순위] PersonalAgent Profile — 자동 학습
  ↓ 팀 기본보다 우선
[4순위] Team Persona — 팀별 기본
```

System Base를 제외하면, 사용자의 명시적 의사가 항상 최우선이다.

---

## 11. 캐시/DB — PostgreSQL 단일 + 4단계 캐시

### 11.1 4단계 캐시 레이어

| 레벨 | 저장 | Key | TTL | LLM |
|------|------|-----|-----|-----|
| **L0 Envelope 캐시** | `cache_ui_envelopes` | `hash(intent,params,teamId,date)` | 1~5분 (스코어) / 1시간 (순위) / 1일 (선수 기본스탯) | 0회 |
| **L1 Template+Binding** | `a2ui_templates` + DB | template_id + row | 무제한 | 0회 |
| **L2 Partial LLM (리액션)** | inline | — | — | 1회 Flash ~50 tokens |
| **L3 Full UIComposer** | inline | — | — | 1~2회 Flash ~500 tokens |

**Gemini Context Caching**: 시스템 프롬프트(System Base + Team Persona + A2UI 팔레트 정의, ~2000 토큰) 팀별 캐시 → 입력 토큰 75% 할인.

### 11.2 핵심 테이블

```sql
-- L0 A2UI envelope 캐시
CREATE TABLE cache_ui_envelopes (
  cache_key      VARCHAR(128) PRIMARY KEY,
  intent         VARCHAR(32) NOT NULL,
  params_hash    VARCHAR(64) NOT NULL,
  team_id        VARCHAR(20),
  envelope_jsonl TEXT NOT NULL,
  data_snapshot  JSONB,
  hit_count      INT DEFAULT 0,
  expires_at     TIMESTAMP NOT NULL,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- L1 A2UI 템플릿
CREATE TABLE a2ui_templates (
  template_id    VARCHAR(64) PRIMARY KEY,
  intent         VARCHAR(32) NOT NULL,
  component_tree JSONB NOT NULL,
  bind_schema    JSONB NOT NULL,
  variants       JSONB,
  version        INT DEFAULT 1,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- 기존
CREATE TABLE cache_scores ( ... );
CREATE TABLE cache_news ( ... );
CREATE TABLE memes ( ... );

-- 관측
CREATE TABLE agent_traces (
  trace_id UUID PRIMARY KEY, user_id UUID, conversation_id UUID,
  intent VARCHAR(32), complexity VARCHAR(16), cache_hit VARCHAR(8),
  llm_calls INT, tokens_in INT, tokens_out INT, duration_ms INT,
  error TEXT, created_at TIMESTAMP DEFAULT NOW()
);
```

### 11.3 무효화 정책

- 스코어 변경 이벤트 → 해당 경기 관련 envelope 전체 DELETE
- 5분 배치: 만료 envelope 정리
- Admin 수동 flush 지원

100명 규모 PostgreSQL 단일 인스턴스 충분.

### 11.4 미채택 (Phase 6+ 재검토)

- Semantic Cache (임베딩 기반 유사질의 캐시) — 검증 부족
- Persona Reaction Cache — 검증 부족

---

## 12. 회원가입/관리

### 12.1 플로우

첫 방문 → 밧디 소개 → 회원가입 (Google OAuth 또는 이메일) → 온보딩 (팀 선택, 페르소나 스타일, 푸시 허용) → PersonalAgent 생성 → 밧디와 첫 대화 시작

### 12.2 사용자 DB

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE, display_name VARCHAR(50),
  auth_provider VARCHAR(20), auth_id VARCHAR(255),  -- 'google' | 'email'
  team_id VARCHAR(20) NOT NULL, persona_style VARCHAR(20) DEFAULT 'passionate',
  level INT DEFAULT 1, xp_points INT DEFAULT 0,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(), last_active TIMESTAMP DEFAULT NOW()
);
CREATE TABLE conversations (
  id UUID PRIMARY KEY, user_id UUID REFERENCES users(id),
  title VARCHAR(100), summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE messages (
  id SERIAL PRIMARY KEY, conversation_id UUID REFERENCES conversations(id),
  role VARCHAR(10), content TEXT NOT NULL,
  ui_component JSONB, tokens_used INT, created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE personal_agent_state (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  profile_summary TEXT, profile_data JSONB DEFAULT '{}',
  custom_persona TEXT, favorite_players INT[],
  message_count INT DEFAULT 0, last_profile_update TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE user_favorites (
  user_id UUID REFERENCES users(id), player_id INT REFERENCES players(id),
  source VARCHAR(20), mention_count INT DEFAULT 0, PRIMARY KEY (user_id, player_id)
);
```

### 12.3 사용자 페이지

| 페이지 | 내용 |
|--------|------|
| **/my/conversations** | 대화 목록, 검색, 삭제 |
| **/my/stats** | 대화 수, 자주 묻는 주제, 예측 적중률, 연속 접속일, 활동 시간대 |
| **/my/level** | 현재 레벨 & XP, 다음 레벨 조건, 해금 안내, 배지, 히스토리 |
| **/settings** | 프로필, 커스텀 페르소나 편집, 알림, 대화 보존기간, 개인화 학습 동의, 계정 |

---

## 13. 레벨 시스템

| Lv | 이름 | 요구 | 해금 |
|----|------|------|------|
| 1 | 신입 팬 | 가입 | 기본 대화, 스코어 |
| 2 | 내야석 | 대화 50회 | 경기 예측, 밈 강화 |
| 3 | 응원단석 | 대화 200회 + 예측 5회 | 두 번째 페르소나 스타일 |
| 4 | 시즌권 | 대화 500회 + 연속 7일 | 상세 통계, 선수 비교 |
| 5 | 12번째 선수 | 대화 1,000회 + 적중률 55%+ | 숨겨진 페르소나, 커스텀 닉네임 |

---

## 14. 푸시 알림 (PWA)

Web Push API + Service Worker + FCM. Android/Desktop 완전 지원. iOS 16.4+ 홈 화면 추가 후 지원.

트리거: 경기 시작 30분 전, 역전/동점, 경기 종료, 레벨업, 관심 선수 활약

---

## 15. Admin 기능

```
/admin
├── /agents         Agent 목록/상태/프롬프트 편집/재시작/로그
├── /core           Intent 규칙/캐시/LLM 라우팅
├── /users          사용자 목록/상세/차단/레벨 조정
├── /personal-agents PersonalAgent 상태 조회/초기화
├── /data           스코어·뉴스·밈·통계 캐시 관리, 크롤링 로그/스케줄
├── /guardrails     금지어/일베패턴/필터/Rate Limit/위반 로그
└── /monitoring     LLM 비용/API 호출량/에러율/서버 상태
```

---

## 16. Web 페이지 구조

```
/                    랜딩 (밧디 소개, 팀 선택)
/auth/*              로그인/가입/OAuth
/chat                메인 채팅 (PWA 메인)
/chat/:id            특정 대화
/my/conversations    대화 목록
/my/stats            나의 통계
/my/level            레벨 가이드
/settings            설정 + 커스텀 페르소나
/about               밧디 소개
/guide               야구 입문 가이드
/terms               이용약관
/privacy             개인정보처리방침
/admin/*             관리자
```

---

## 17. 기술 스택

| 영역 | 선택 |
|------|------|
| 프론트 프레임워크 | **Next.js 14+ App Router** / React 18 / Tailwind + Design Tokens / Zustand / PWA |
| Agent UI | **CopilotKit** (`@copilotkit/react-core`, `@copilotkit/a2ui-renderer`) + **AG-UI Protocol** |
| UI 컴포넌트 | Radix UI + shadcn/ui + Pretendard Variable |
| 백엔드 | **NestJS** (TypeScript) + `copilotRuntimeNestEndpoint` |
| Agent Orchestration | **LangGraph.js** (계층적 CoAgents) |
| LLM 어댑터 | `GoogleGenerativeAIAdapter` + 자체 MultiLLMAdapter + Gemini Context Caching |
| DB | **PostgreSQL 16 단일 인스턴스** (Docker, 비표준 포트 `54329`) |
| LLM | Gemini 2.5 Flash/Flash-Lite/Pro + 3 Flash (라우팅) |
| Observability | **Langfuse 셀프호스팅** (비용 0) |
| 크롤링 | Playwright (Stealth) + cheerio |
| 인증 (로컬/P0~P5) | 이메일 + JWT + `AuthProvider` 추상화 |
| 인증 (P6+) | Google OAuth 어댑터 교체 |
| 푸시 (로컬) | Web Push + VAPID 로컬 |
| 푸시 (P6+) | FCM 어댑터 교체 |
| 인프라 (P6+) | 로컬 Linux PC + Cloudflare Tunnel + Pages |

---

## 18. 비용 (MVP 100명, 4단계 캐시 적용)

**가정**: 100명 × 15건/일 = 45,000건/월. L0 60% / L1 10% / L2 20% / L3 10% 분포. Gemini Context Caching 적용.

| 항목 | 호출 수 | 토큰 (in/out) | 월 비용 |
|------|---------|--------------|---------|
| L0 Envelope HIT | 27,000 | 0 | ₩0 |
| L1 Template+Binding | 4,500 | 0 | ₩0 |
| L2 Partial LLM (Flash+CC) | 9,000 | ~800/50 | ~₩900 |
| L3 Full UIComposer (Flash+CC) | 4,500 | ~1,500/500 | ~₩4,000 |
| Semantic Guardrail (Flash-Lite) | ~2,000 | ~300/20 | ~₩70 |
| Batch 요약 (Flash-Lite Batch) | ~60 | ~3,000/200 | ~₩15 |
| Search Grounding (무료 5K/월 초과분) | — | — | ~₩5,000 |
| CopilotKit / Langfuse 셀프호스팅 | — | — | ₩0 |
| 인프라 (P6+ 로컬 PC + Cloudflare) | — | — | ₩0 |
| 도메인 (P6+) | — | — | ~₩1,000 |
| FCM / 크롤링 | — | — | ₩0 |
| **합계** | | | **~₩10,000 ~ ₩15,000** |

A2UI·CopilotKit 풀스택 채택으로 인한 비용 증가 없음 (오히려 캐싱 구조화로 예측 가능성 향상).

---

## 19. 법적 리스크

| 행위 | 위험 | 대응 |
|------|------|------|
| Statiz/KBReport 크롤링 | 중간 | 최소 부하, 출처 표기 |
| KBO 공식 접근 | 중~높 | 정적 페이지만, 최소 접근 |
| 네이버/다음 | 높음 | **사용 안 함** |
| 뉴스 요약 | 중간 | 요약+링크만 |
| 팀 로고 | 중간 | 비공식 명시 |

필수 고지: "밧디(batdi)는 KBO 및 각 구단과 무관한 비공식 팬 서비스입니다"

---

## 20. 리스크 & 대응

| 리스크 | 대응 |
|--------|------|
| LLM 환각 | 수치는 DB 기반, LLM은 UI 구조+감정 톤만. DataBinder가 리터럴 값 출력 차단 |
| A2UI Schema 위반 | UIValidator 검증 + LLM 재호출 1회 + L1 Template fallback |
| CopilotKit 업데이트 호환성 | 버전 고정 + 업데이트 시 통합 테스트 우선 |
| LangGraph state 복잡도 | Langfuse 트레이스로 노드별 디버깅. subgraph 단위 격리 |
| 서버 다운 | UPS + 자동 재시작 + Cloudflare 장애 페이지 (P6+) |
| 크롤링 사이트 변경 | 추상화 계층, 다중 소스 fallback |
| 비용 폭발 | Rate Limiting + 비용 모니터링 + 일일 상한 |
| 아동 부적절 콘텐츠 노출 | System Base 가드레일(불변) + 출력 이중 검증 |
| 일베 밈 유입 | 입출력 패턴 매칭 + 반복 위반 자동 제재 |
| 프롬프트 해킹 | 입력/출력/커스텀 프롬프트 3중 검증 |
| 1인 운영 번아웃 | scope 최소화, 자동화 투자 |

---

## 21. 로드맵 (장기 사이드 프로젝트 · Mac 로컬 우선)

| Phase | 기간 | 핵심 |
|-------|------|------|
| **P0. 학습·탐색** | 1~2주 | CopilotKit, LangGraph, AG-UI, A2UI 스펙 학습 + PoC |
| **P1. 기반** | 3주 | Next.js + NestJS + `copilotRuntimeNestEndpoint` + LangGraph 1노드 + Gemini 어댑터 + A2UI 팔레트 v0 + Langfuse + 이메일 Auth |
| **P2. Core 그래프** | 2~3주 | Core CoAgent 전 노드 + 가드레일 + ScoreGraph + 4단계 캐시 + 한화 페르소나 + A2UI E2E |
| **P3. 확장** | 3~4주 | 4팀 + Stats/News/Chat/Meme Subgraph + Personal Service + A2UI 도메인 widget 풀세트 + L1 템플릿 풀세트 |
| **P4. 개인화·액션** | 2주 | `useCopilotAction` 도메인 함수, 레벨·로컬 푸시, UIComposer 고도화 (지식 레벨 적응) |
| **P5. 안정화** | 2주 | 가드레일 강화, Admin + Langfuse 대시보드, Rate Limit, 부하 테스트, 약관, 로컬 RC |
| **P6. 인프라 이관·베타 오픈** | 1~2주 | Linux PC + 도메인 + Cloudflare + OAuth + FCM + v1.0 공개 |
| **총** | **14~18주** | 사이드 프로젝트 여유 페이스 |

---

## 22. 보류/추후 검토

| 항목 | 시점 |
|------|------|
| ~~서비스 이름/브랜딩~~ | ~~Phase 3 전~~ → **확정: 밧디(batdi)** |
| 로고/마스코트 디자인 | Phase 2~3 |
| 시즌 오프 전략 | 10월 |
| 광고 (Google Ads) | 1,000명+ |
| 추가 6개 팀 | Phase 4+ |
| 소셜 기능 | PMF 확인 후 |
| 음성 인터페이스 | 추후 |
| 유료 데이터 API | 필요 시 |

---

*밧디(batdi) v8 — CopilotKit + LangGraph + A2UI 전면 채택, 계층적 CoAgent, 4단계 캐시, Gemini Context Caching, Langfuse 관측성. 기술 기준점은 [batdi-architecture.md](./batdi-architecture.md).*
