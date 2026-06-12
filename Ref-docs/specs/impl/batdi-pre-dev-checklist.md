---
id: batdi-pre-dev-checklist
title: 밧디 개발 착수 전 결정·준비 체크리스트
type: impl
version: 0.1.0
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
| G1-1 | **CopilotKit + A2UI 렌더러 실존성** | `@copilotkit/a2ui-renderer`·A2UI JSONL 스펙의 npm 실존·버전·성숙도 미확인. **전체 UI 파이프라인의 토대이자 단일 실패점** | PoC 착수 전 Context7/npm으로 패키지명·버전·A2UI 지원 확인. 미존재/미성숙이면 PoC 3에서 즉시 대안(자체 JSONL 렌더러) 결정 + ADR-016 | architect·planner |
| G1-2 | **LangGraph.js 인프로세스 등록 가능성** | CopilotRuntime이 JS LangGraph(NestJS 인프로세스)를 1급 지원하는지 미검증(통상 Python/별도서버 가정) | PoC 2에서 최우선 검증. 불가 시 LangGraph 별도 프로세스 아키텍처로 ADR-002 수정 | architect·planner |
| G1-3 | **의존성 버전 핀 (latest 금지)** | architecture §13 전부 "latest" — CLAUDE.md "버전 고정" 규칙 위반 | PoC 결과로 Next.js·NestJS·React·LangGraph.js·CopilotKit·Gemini 어댑터 실호환 버전 확정 → §13/ADR 갱신, lockfile 동결 | planner |

> P0 PoC DoD(dev-plan §0.5~0.7)를 "동작 확인"이 아니라 **G1-1·G1-2 실존성 검증 게이트**로 강화 권장.

## 🟡 게이트 2 — P1(기반) 착수 전 인터페이스 SSOT 완결

| # | 항목 | 현재 공백 | 해야 할 일 | 관점 |
|---|------|-----------|-----------|------|
| G2-1 | **A2UI Envelope 실 스키마** | `surfaceUpdate`/`dataModelUpdate`/`beginRendering` 필드 레벨 정식 스키마 부재(palette-schema §5.4 빈 칸). PoC 3·태스크 2.4가 손으로 envelope 생성 | `scoreboardWidget` 1종 round-trip 골든 JSONL 샘플 확정 → agui-contract/palette-schema `1.0`화 | architect |
| G2-2 | **`{{bind:...}}` 경로 해석 규약** | DataBinder의 path 네임스페이스·타입 강제·누락 시 동작 미정. ServiceSummary↔full payload 키 구조 통일 규칙 부재 | `bind` root 네임스페이스(`data.*`)와 ServiceDataStore 객체 형태 1:1 고정 + fallback 규칙 명문화 | architect |
| G2-3 | **기존 테이블 DDL이 DB SSOT에 부재** | db-schema는 신규/확장만 담음. `users`·`conversations`·`messages`·`personal_agent_state`·`players`는 platform-ops에만 → SSOT 이원화, 컬럼/FK 충돌 위험 | 기존 테이블 DDL을 db-schema로 흡수해 단일 SSOT 완성(Prisma 1.1이 이 한 문서만 보고 작성 가능하게) | architect |
| G2-4 | **IntentRouter enum 불일치 + complexity 규칙** | architecture intent(8종)와 platform-ops 사전(`standings` 별도/`composite` 없음) 불일치. `complexity(simple/general/composite)` 판정 규칙 부재(캐시 분기 핵심) | intent enum을 architecture 기준 단일화 + complexity 판정 규칙 명문화(태스크 4.4 "정확도 95%" 전제) | architect |
| G2-5 | **MultiLLMAdapter 라우팅 구체 규칙** | "사용처→모델" 표만 있고 런타임 분기 함수·모델 ID 문자열·무료할당 소진 폴백 체인 미정 | intent/complexity/quota → 모델 ID 결정 테이블 1함수 명세 + 폴백 체인 | architect |
| G2-6 | **Auth/Push Provider 인터페이스 시그니처** | "추상화 유지"만 반복, 메서드 시그니처 부재 → P6 교체 안전성이 P1 설계 품질에 의존 | `AuthProvider`(verify/issue/mergeIdentity)·`PushProvider`(subscribe/send) 최소 시그니처를 interface 문서로 추가 | architect·reviewer |
| G2-7 | **A2UI 깊이/노드 제한 검증 알고리즘** | maxDepth 4·maxNodes 30 수치만 있고 카운트 산정 방식·위반 시 처리 미정 | depth/node 카운트 정의 + 위반 시 전체 L1 폴백(재호출 없음) 고정 | architect |

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

## 즉시 착수 권고 (Top 5)

1. **G0-1 `.env` gitignore + `.env.example`** — 가장 싸고 가장 치명적. 첫 커밋 전 필수.
2. **G1-1 CopilotKit/A2UI 패키지 실존성 검증** — 미존재 시 전체 아키텍처 전제가 흔들림. PoC 0순위.
3. **G2-3 db-schema 단일 SSOT 완성** — Prisma 스키마(P1 1.1)의 직접 입력. interface `1.0`화.
4. **G0-3 크롤링 약관 1차 조사** — 첫 크롤링 전 ALLOW/DENY 확정.
5. **ENV-1~5 monorepo+Docker 스캐폴드** — P0 모든 PoC의 토대.
