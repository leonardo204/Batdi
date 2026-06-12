---
id: batdi-service-plan
title: 밧디 서비스 기획 종합
type: design
version: 8.1.0
status: approved
scope: 서비스 개요·전체 아키텍처·웹 구조·기술 스택·비용·법무·리스크·로드맵 + 기획 분할 인덱스 (기획 SSOT 진입점)
related: [batdi-architecture, batdi-development-plan, batdi-uiux-guideline, batdi-persona-guardrail, batdi-platform-ops]
updated: 2026-06-12
---

# 밧디(batdi) — KBO 야구 전문 Agentic Chatbot 종합 검토 문서 (v8)

> 작성일: 2026-04-04 (v8 — CopilotKit · LangGraph · A2UI 전면 채택)
> 서비스명: **밧디 (batdi)** — bat + buddy, 너의 야구 친구
> 1인 사이드 프로젝트 / MVP 100명 / 장기 설계 우선 / 광고 없음 (향후 Google Ads만 검토)
> **Next.js 14+ · CopilotKit · LangGraph · A2UI · Gemini 2.5/3 · PostgreSQL (단일)**
> 우선 지원 팀: 롯데 · 두산 · 기아 · 한화
> 동반 문서: [개발계획서](../impl/batdi-development-plan.md) · [UI/UX 지침](./batdi-uiux-guideline.md) · [시스템 아키텍처](./batdi-architecture.md)

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
- **Gemini Context Caching**: **MVP 보류** — 시스템 프롬프트 ~2K 토큰이 API 최소 요건(32K) 미충족. 프롬프트 32K 돌파 시 재도입 (§5.3)
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
      │      fail → L1 Template fallback (재호출 X)    │
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

### 기획 문서 인덱스 (분할)

본 v8 기획서는 분량 관리를 위해 세 문서로 분할되었다. 본문 절은 아래 문서에 위치한다.

- **페르소나·가드레일·개인화·멀티턴** (§3~§8) → [batdi-persona-guardrail](./batdi-persona-guardrail.md)
- **Data Agent·안정성·캐시/DB·회원·레벨·푸시·Admin** (§9~§15) → [batdi-platform-ops](./batdi-platform-ops.md)
- **DB 정식 DDL** → [batdi-db-schema](../interface/batdi-db-schema.md)

본 문서는 개요·아키텍처·웹 구조·기술 스택·비용·법무·리스크·로드맵을 담는 진입점이다.

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
| LLM 어댑터 | `GoogleGenerativeAIAdapter` + 자체 MultiLLMAdapter (Context Caching 미적용, §5.3) |
| DB | **PostgreSQL 16 단일 인스턴스** (Docker, 비표준 포트 `54329`) + **PgBouncer** (transaction pooling) |
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

**가정**: 100명 × 15건/일 = 45,000건/월. L0 60% / L1 10% / L2 20% / L3 10% 분포. **Context Caching 미적용** (§5.3 — 프롬프트 32K 토큰 미달).

| 항목 | 호출 수 | 토큰 (in/out) | 월 비용 |
|------|---------|--------------|---------|
| L0 Envelope HIT | 27,000 | 0 | ₩0 |
| L1 Template+Binding | 4,500 | 0 | ₩0 |
| L2 Partial LLM (Flash) | 9,000 | ~800/50 | ~₩1,000 |
| L3 Full UIComposer (Flash) | 4,500 | ~1,500/500 | ~₩4,000 |
| Semantic Guardrail (Flash-Lite) | ~2,000 | ~300/20 | ~₩70 |
| Batch 요약 (Flash-Lite Batch) | ~60 | ~3,000/200 | ~₩15 |
| Search Grounding (무료 5K/월 초과분) | — | — | ~₩5,000 |
| CopilotKit / Langfuse 셀프호스팅 | — | — | ₩0 |
| 인프라 (P6+ 로컬 PC + Cloudflare) | — | — | ₩0 |
| 도메인 (P6+) | — | — | ~₩1,000 |
| FCM / 크롤링 | — | — | ₩0 |
| **합계** | | | **~₩10,000 ~ ₩15,000** |

A2UI·CopilotKit 풀스택 채택으로 인한 비용 증가 없음. Context Caching 미적용에 따른 증가분도 월 ~₩100 수준으로 미미.

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
| A2UI Schema 위반 | UIValidator 검증 실패 시 **LLM 재호출 없음** → 즉시 L1 Template fallback + Langfuse 비동기 로깅 (레이턴시 우선) |
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

*밧디(batdi) v8 — CopilotKit + LangGraph + A2UI 전면 채택, 계층적 CoAgent, 4단계 캐시, Langfuse 관측성. 기술 기준점은 [batdi-architecture.md](./batdi-architecture.md).*
