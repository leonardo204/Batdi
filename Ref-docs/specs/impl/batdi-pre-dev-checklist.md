---
id: batdi-pre-dev-checklist
title: 밧디 개발 착수 전 결정·준비 체크리스트
type: impl
version: 0.5.0
status: draft
scope: P0 코드 착수 전 확정·준비해야 할 설계공백·환경·테스트·보안 항목 종합 게이트
related: [batdi-development-plan, batdi-architecture, batdi-agui-contract, batdi-a2ui-palette-schema, batdi-copilot-actions, batdi-db-schema, batdi-persona-guardrail, batdi-platform-ops, batdi-test-plan]
updated: 2026-06-12
---

# 밧디 개발 착수 전 결정·준비 체크리스트

> 설계 완료·구현 미착수 상태에서, P0(PoC)→P1(기반) 코딩 전에 확정/준비해야 할 항목을 4개 관점(architect·planner·test-engineer·reviewer)에서 수집·종합한 것이다. **게이트별 우선순위**로 묶었다. 각 항목의 SSOT는 `related` 문서를 따른다.

## 🔴 게이트 0 — 첫 커밋·첫 코드 전 (되돌릴 수 없는 리스크)

| # | 항목 | 현재 공백 | 해야 할 일 | 관점 |
|---|------|-----------|-----------|------|
| G0-1 | **`.env` gitignore 부재** | `.gitignore`에 `.env` 패턴 없음 → 첫 커밋부터 키가 git 히스토리에 영구 노출 | `.env*` gitignore 등록 + `.env.example` 템플릿(`DATABASE_URL`·`GEMINI_API_KEY`·`JWT_SECRET`·`LANGFUSE_*`·`VAPID_*`)만 커밋. gitleaks pre-commit 훅 | planner·reviewer |
| G0-2 | **Gemini 키 노출·과금 폭탄** | 키 발급 시 사용량 상한·알림 미설정 | 키에 일일 상한+알림. 이미 발급했다면 더미로 시작, 실키는 `.env`만 | reviewer |
| G0-3 | **크롤링 소스 약관·robots.txt 미조사** | T1 소스(KBO공식·Statiz·KBReport·Google News RSS) 적법성 미확인. 위반 크롤링은 DB 자산 전체 오염 | ALLOW/DENY 표 1차 작성. 네이버/다음은 크롤러 코드 레벨 하드 블록. rate-limit(10초/동시1)을 크롤러 코어 기본값으로 강제 | reviewer |

## 🟠 게이트 1 — P0 PoC를 "의사결정 게이트"로 (단일 실패점 검증)

| # | 항목 | 현재 공백 | 해야 할 일 | 관점 |
|---|------|-----------|-----------|------|
| G1-1 | ✅ **CopilotKit + A2UI 렌더러 실존성** | **해소(2026-06-12)**: `createA2UIMessageRenderer`(react-core) + `@copilotkit/a2ui-renderer` 실존. PoC #2 실측으로 실제 포맷은 A2UI **표준 3-op**(createSurface/updateComponents/updateDataModel) 확인 — ADR-017 정정 | ~~PoC 전 검증~~ 완료. 잔여: 버전 핀(G1-3) | architect·planner |
| G1-2 | ✅ **LangGraph 통합 = HTTP (PoC FEASIBLE)** | **PoC 실증 완료(2026-06-12)**: 순수 JS 풀 라운드트립 성공. 정정: 연결은 `LangGraphAgent({deploymentUrl, graphId})`(HttpAgent 아님), 서버는 `langgraphjs dev`, serviceAdapter=EmptyAdapter, threadId/runId UUID 강제 | **ADR-016 확정** + **A2UI emit 스파이크 완료(PoC #2 FEASIBLE)**: gemini-2.5-flash로 A2UI 표준 3-op emit + bind-분리(환각차단) 적대조건까지 실증(ADR-017·019). 잔여: `langgraphjs build`(Docker) 검증, 픽셀 렌더·커스텀 카탈로그·`getA2UITools` 후속 | architect·planner |
| G1-3 | 🔄 **의존성 버전 핀** | **PoC로 실버전 확보** → architecture §13.1 핀표. (CopilotKit 1.60.0·@langchain/langgraph 1.4.1·Next 14.2.35 등) | 본 개발 착수 시 lockfile 동결 + Gemini 어댑터 버전만 추가 확인 | planner |

> P0 PoC DoD(dev-plan §0.5~0.7)를 "동작 확인"이 아니라 **G1-2 LangGraph-over-HTTP 검증 게이트**로 강화 권장. G1-1은 검증 완료.

## 🟡 게이트 2 — P1(기반) 착수 전 인터페이스 SSOT 완결

| # | 항목 | 현재 공백 | 해야 할 일 | 관점 |
|---|------|-----------|-----------|------|
| G2-1 | ✅ **A2UI Envelope 실 스키마** | **완료(2026-06-12, PoC #2 실측 정정)**: agui-contract §2.2.1에 **표준** 골든 JSONL(createSurface→updateComponents→updateDataModel, component키, `{path:}`) 수록 | 잔여: widget별 골든 샘플·커스텀 카탈로그는 P1 | architect |
| G2-2 | 🔄 **바인딩 = A2UI 값 슬롯 `{path:}`** | **확정(ADR-017)**: `{{bind:"home.score"}}`(L1 템플릿) → emit 시 A2UI 값 슬롯 `{"path":"/home/score"}`로 컴파일. 값은 `updateDataModel`로 주입. palette-schema §5.5.1 | 잔여: `data.*` 네임스페이스↔ServiceDataStore 키 매핑은 P0/P1 DataBinder 구현 시 | architect |
| G2-3 | ✅ **DB 단일 SSOT 완성** | **완료(ADR-018)**: db-schema 1.0에 16개 테이블(사용자·도메인·캐시·관측) 통합, design 문서 DDL은 포인터. Prisma는 이 문서만 입력 | 잔여: ON DELETE 정책 일부 TBD(법무 검토, LAW-2 연동) | architect |
| G2-4 | ✅ **IntentRouter enum·complexity** | **완료**: [batdi-routing](../interface/batdi-routing.md) 신설 — intent 7종 단일화(`standings`→`stats` 하위, `composite`는 complexity 축으로), complexity 판정 규칙·키워드 사전 구조 명문화 | architecture가 SSOT, design 섹션에 포인터 | architect |
| G2-5 | ✅ **MultiLLMAdapter 결정표** | **완료**: batdi-routing에 모델 결정표 7행(`selectModel`)·무료할당 폴백 체인(3 Flash→2.5 Flash→Lite)·사용처별 기본 모델. model id 문자열은 구현 시 확인 | architecture §6.2·persona-guardrail §5.2 중복 → routing으로 통합 | architect |
| G2-6 | ✅ **Auth/Push Provider 시그니처** | **완료**: [batdi-provider-interfaces](../interface/batdi-provider-interfaces.md) — AuthProvider 4메서드·PushProvider 4메서드·공유 타입 7종, P6 어댑터 교체 계약. 갭: `push_subscriptions` 테이블 db-schema 미존재(후속) | architect·reviewer |
| G2-7 | ✅ **A2UI 깊이/노드 검증** | **완료**: a2ui-palette-schema §5.4.1 — depth(루트=1)/node(도달가능) 정의 + BFS 의사코드 + 위반 시 전체 L1 폴백(재호출 없음·부분절단 아님) | architect |

## 🔵 게이트 1~2 — 환경·인프라 스캐폴딩 (P0 0.2~0.4)

| # | 항목 | 현재 상태 | 해야 할 일 | Blocker |
|---|------|-----------|-----------|:---:|
| ENV-1 | pnpm monorepo 구조 | 없음 | `apps/web`·`apps/api`·`packages/ui`·`packages/a2ui-schema`·`packages/types` 배치 + `pnpm-workspace.yaml` | P0 |
| ENV-2 | 1-command 기동 | 없음 | `pnpm dev`로 web(3000)+api(3001) 병렬 기동(turbo/concurrently) | P0 |
| ENV-3 | PostgreSQL 16 Docker | 없음(Docker OK) | `docker-compose.yml` PG16 `54329:5432` + named volume | P0 |
| ENV-4 | Langfuse 셀프호스팅 | 없음 | compose에 Langfuse + project key 발급 | P0 |
| ENV-5 | Gemini 키·쿼터 | 없음 | AI Studio 키 발급 + 무료할당(3 Flash 5K/월·2.5 Flash 500 RPD) 확인 | P0 |
| ENV-6 | Node/pnpm 버전 핀 | Node v24.4.1·pnpm 10.6.4 설치(계획 "20+") | `.nvmrc`+`engines` LTS 핀(22 권장) 확정 — v24 빌드 미검증 | - |
| ENV-7 | TS/lint/format/hook | 없음 | `tsconfig.base.json`(strict)+ESLint+Prettier+Husky | P0 내 |

## 🟣 동시 구현 강제 (모듈과 한 묶음 — "나중 추가" 시 그 기간이 취약 구간)

| # | 항목 | 리스크 | 관점 |
|---|------|--------|------|
| SEC-1 | **useCopilotAction ↔ 백엔드 검증 1:1** | 검증 없는 액션 노출 시 프롬프트 인젝션으로 IDOR(타 사용자 리소스 조작). `playerId`/`conversationId` 서버 ownership 검증 필수 | reviewer |
| SEC-2 | **프롬프트 인젝션 다층 방어 + 출력 가드레일** | Normalizer→패턴매칭을 가드레일 모듈 1번으로. 커스텀 페르소나(신뢰불가 입력)도 저장 전 동일 검증. `<system_base immutable>` 경계 | reviewer |
| SEC-3 | **L0 캐시 Poisoning 가드** | 개인화 응답이 L0에 저장되면 타 사용자 누출. `CacheStore.write()` 진입 가드 + `personaScope` 키 필수 + PII 감지 시 abort | reviewer |
| SEC-4 | **아동안전 System Base 불변 고정** | 아동보호 지시를 priority=1 불변 계층에 고정, 어떤 커스텀/팀 계층도 override 불가. 가입 시 나이/학교/주소 묻지 않음을 코드로 보장 | reviewer |
| SEC-5 | **출처 표기·비공식 면책 데이터모델 내장** | `source` 없는 데이터 저장 금지(크롤러 계약). 뉴스 본문 전체 저장 금지(요약+링크만). 비공식 면책 문구 상수 | reviewer |

## ⚪ 테스트 인프라 사전 결정 (P0 스캐폴드 시 — test-plan OI 대응)

| # | 결정 | 권장안 | 시점 |
|---|------|--------|------|
| T-01 | 단위·통합 러너 | **Vitest** (Vite+ESM 모노레포 정합) | P0 |
| T-02 | E2E | **Playwright** (CLS 측정·Lighthouse) | P0 |
| T-03 | LLM 비결정성 | 단위·통합 `vi.mock`, E2E만 선택적 실호출(`GEMINI_TEST_MODE=live`) | P1 |
| T-06 | 테스트 DB | **54330 격리 포트**(개발 54329와 분리, sqlite 금지) | P1 |
| T-04/05 | 가드레일 코퍼스 | YAML fixtures 분리 + **민감 케이스 git 제외** | P2 |
| T-08/09 | 커버리지·CI 게이트 | `@vitest/coverage-v8`. 핵심모듈 80%+가드레일 케이스 100% 통과. 머지 차단: 빌드/tsc/단위 0 실패 | P0(설계)·P3(측정) |
| T-11 | P0 TDD 범위 | PoC는 TDD 제외(수동 체크), P1 핵심모듈(DataBinder·UIValidator·FreeQuotaTracker)부터 TDD | P0 |
| T-14 | IntentRouter 정확도 | 30건 fixtures YAML + CI 자동 측정(95%=28/30) | P2 |

## 🟤 로드맵 앞당김·후속 (법무·운영)

| # | 항목 | 권장 | 시점 |
|---|------|------|------|
| LAW-1 | **약관·개인정보처리방침 초안** | 로드맵상 P5지만 **개인정보 저장 첫 시점(P1 가입)부터 법적 의무** → 회원 테이블 구현 전 초안 | P5→**P1** |
| LAW-2 | **탈퇴 시 데이터 파기 매트릭스** | `messages`·`conversations`·`agent_traces`·`tool_call_logs`·Langfuse 트레이스 CASCADE/익명화 정책 → db-schema FK에 반영 | P1 |
| LAW-3 | Admin 인증·인가 격리 | role 기반 분리 인가 + 감사 로그(P0~P5 로컬도 기본 인증) | P1 |
| LAW-4 | Rate Limiting·비용 상한 | 사용자/IP Rate Limit + FreeQuotaTracker 일일 상한 + 초과 시 graceful degradation | P1 |
| LAW-5 | L0 캐시 무효화 메커니즘 | MVP는 TTL 기반으로 단순화(이벤트 기반은 ADR 보류) | P2 |
| LAW-6 | T3 세이버 소스 차단·유료전환 | Statiz/KBReport 봇차단 확인 + 유료 API 조기전환 판단 | P0 조사→P3 |

---

## 즉시 착수 권고 (Top 5 — 2026-06-12 갱신)

> ✅ 완료: G0-1(.env gitignore)·ENV-1~5(스캐폴드)·G1-1/G1-2(PoC FEASIBLE)·G1-3(실버전)·G2-1~7(인터페이스). 아래는 **다음 차례**.

1. **실제 P0/P1 구현 착수** — 검증된 토대 위 LangGraph.js 별도 프로세스(`langgraphjs dev`) + NestJS `copilotRuntimeNestEndpoint` + `LangGraphAgent` 배선(ADR-016대로).
2. **🔑 노출된 Gemini 키 폐기(rotate)** — 채팅 평문 노출. AI Studio에서 삭제·재발급 + 일일 상한·알림(G0-2).
3. **G0-3 크롤링 약관 1차 조사** — 첫 크롤링 전 ALLOW/DENY(미완).
4. **SEC-1~5 동시 구현 강제** — 해당 모듈과 한 묶음(검증/가드레일/캐시 Poisoning).
5. **db-schema 갭 보강** — `push_subscriptions` 테이블 추가(G2-6 갭) + ON DELETE 정책 확정(LAW-2).
