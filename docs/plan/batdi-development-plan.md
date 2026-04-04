# 밧디(batdi) 개발 계획서 (Dev Plan v2)

> 작성일: 2026-04-04 (v2 — CopilotKit·LangGraph·A2UI 전면 채택)
> 근거 문서: [batdi-service-plan.md](./batdi-service-plan.md) v8, [batdi-architecture.md](./batdi-architecture.md), [batdi-uiux-guideline.md](./batdi-uiux-guideline.md)
> 총 기간: **14~18주** (Mac 로컬 P0~P5) + **P6 인프라 이관 1~2주**
> 작업자: 1인 사이드 프로젝트 (장기 설계 우선, 압박 없음)

### 개발 환경 전략

- **P0~P5 전 과정 Mac 로컬 개발**. Linux PC·도메인·Cloudflare·OAuth·FCM은 **P6에서만** 도입
- **PostgreSQL Docker**, 호스트 포트 **`54329`** (이관 PC 기존 PG 5432 충돌 방지)
- **Langfuse 셀프호스팅 Docker**, 로컬 시작부터 트레이싱
- **인증**: 로컬 이메일+JWT + `AuthProvider` 인터페이스 추상화 → P6에 Google OAuth 어댑터 교체
- **푸시**: 로컬 VAPID + `PushProvider` 추상화 → P6에 FCM 어댑터 교체
- 공개 URL 불필요, `localhost:3000`(web) + `localhost:3001`(api) + `localhost:54329`(pg) + `localhost:3000/api/copilotkit`(runtime)

---

## 1. 마일스톤

| 마일스톤 | 주차 | 판정 기준 |
|----------|------|----------|
| **M0. 학습·PoC** | P0 말 | CopilotKit Provider ↔ LangGraph 1노드 ↔ Gemini adapter ↔ A2UI envelope 1개 E2E 성공 |
| **M1. 기반 스켈레톤** | P1 말 | 이메일 로그인 → CopilotChat → Core LangGraph 최소그래프 → A2UI 렌더 → Langfuse 트레이스 |
| **M2. 한화 알파** | P2 말 | 한화 팬 "스코어 어때?" → L0/L1/L2 3경로 모두 동작 + A2UI 카드 + 페르소나 리액션 |
| **M3. 4팀 확장 알파** | P3 말 | 4팀 모두 Subgraph + A2UI 도메인 widget 풀세트 + L1 템플릿 풀세트 |
| **M4. 개인화·액션** | P4 말 | `useCopilotAction` 도메인 함수 + L3 UIComposer 복합 질의 + 레벨/로컬 푸시 |
| **M5. 로컬 RC** | P5 말 | 가드레일·부하·약관 완비, 본인 1주 자가 사용, `v1.0-rc` 태그 |
| **M6. 공개 베타** | P6 말 | 인프라 이관 완료, `batdi.kr` 공개, 베타 10명, `v1.0` 태그 |

---

## 2. Phase 0 — 학습·탐색·PoC (1~2주)

### 목표 (M0)
CopilotKit + LangGraph + A2UI + Gemini 통합 최소 경로를 검증하고, 기술 기준점을 확정한다.

### 태스크

| # | 항목 | DoD |
|---|------|-----|
| 0.1 | Node 20+, pnpm, Docker Desktop 확인 | 버전 기록 |
| 0.2 | monorepo 스캐폴드: `apps/web` (Next.js 14+), `apps/api` (NestJS), `packages/ui`, `packages/a2ui-schema`, `packages/types` | `pnpm install` + `pnpm dev` 동시 기동 |
| 0.3 | PostgreSQL Docker Compose (`54329:5432`) + Langfuse Docker | `docker compose up` 후 `psql -p 54329` + Langfuse UI 접속 |
| 0.4 | Gemini API 키 발급 + `.env.local` | `curl` 호출 응답 확인 |
| 0.5 | **PoC 1**: Next.js + CopilotKitProvider → NestJS `copilotRuntimeNestEndpoint` → GoogleGenerativeAIAdapter → 에코 응답 | "hi" → 스트리밍 응답 수신 |
| 0.6 | **PoC 2**: LangGraph 1노드(Gemini 호출) → CopilotRuntime `agents` 등록 → 프론트 `useCoAgent` 상태 관찰 | 노드 state가 프론트에 StateSnapshot으로 도착 |
| 0.7 | **PoC 3**: A2UI JSONL 3-message envelope 수동 작성 → `createA2UIMessageRenderer` → 렌더링 | scoreboard 카드 1개 UI 표시 |
| 0.8 | **PoC 4**: Langfuse에 LangGraph 트레이스 기록 | 노드별 latency/tokens UI 확인 |
| 0.9 | ESLint + Prettier + tsconfig strict + Husky | `pnpm lint` 통과 |
| 0.10 | 크롤링 사전 테스트 (Statiz/KBO) | 200 응답 확인 or 차단 시 대안 결정 |
| 0.11 | ADR 문서 초안 확정 | `batdi-architecture.md` ADR 섹션 업데이트 |

### P0 완료 조건
- [x] 4개 PoC 모두 성공
- [x] 기술 스택 확정, ADR 기록 완료
- [x] `pnpm dev`로 전 스택 1-command 기동

---

## 3. Phase 1 — 기반 (3주)

### 목표 (M1)
CopilotKit Provider ↔ Core LangGraph ↔ A2UI 렌더링의 **최소 end-to-end** 파이프라인 완성. 이메일 로그인 + 온보딩 + 채팅 UI 뼈대.

### W1: DB 스키마 + 백엔드 뼈대

| # | DoD |
|---|-----|
| 1.1 | Prisma 스키마: `users`, `conversations`, `messages`, `personal_agent_state`, `cache_ui_envelopes`, `a2ui_templates`, `agent_traces` | 마이그레이션 up/down 성공 |
| 1.2 | NestJS 모듈: `AuthModule`(이메일+JWT+`AuthProvider`), `CopilotModule`, `AgentModule`, `CacheModule` | `/health` 200 |
| 1.3 | `copilotRuntimeNestEndpoint` 컨트롤러 `/api/copilotkit` + `GoogleGenerativeAIAdapter` | PoC 1 재현 |
| 1.4 | `MultiLLMAdapter` 인터페이스 + GeminiAdapter 구현 + `FreeQuotaTracker` | 모델 4종 라우팅 유닛테스트 |
| 1.5 | Langfuse SDK 연동 + trace decorator | 모든 LLM 호출이 Langfuse에 기록 |

### W2: Core LangGraph 최소 그래프

| # | DoD |
|---|-----|
| 2.1 | `CoreState` 타입 정의 (architecture §3.1) | `packages/types` 공유 |
| 2.2 | 노드 구현: `InputGuardrail`(stub) → `IntentRouter`(키워드) → `CacheLookup`(stub) → `UIComposer`(L1 Template only) → `DataBinder` → `OutputGuardrail`(stub) → `EmitA2UI` | Core Graph 컴파일·실행 성공 |
| 2.3 | `LangGraphAgent`로 CopilotRuntime에 등록 | 프론트 AG-UI stream 수신 |
| 2.4 | A2UI `scoreboardWidget` 템플릿 1개 seed + DataBinder 바인딩 치환 | stub 스코어 데이터 카드 렌더 |
| 2.5 | `packages/a2ui-schema`: 팔레트 타입 정의 + JSON Schema + UIValidator | Schema 위반 케이스 검증 테스트 |

### W3: 프론트 스켈레톤 + 이메일 Auth + CopilotChat

| # | DoD |
|---|-----|
| 3.1 | Next.js 14+ App Router 스캐폴드 + Tailwind + 디자인 토큰 (uiux-guideline §2) | `/` `/auth/login` `/chat` 라우트 |
| 3.2 | 이메일 가입/로그인 UI + JWT 저장(HttpOnly cookie) + `/dev/mock-login` | 로그인 → `/chat` 이동 |
| 3.3 | 온보딩 페이지 (팀 선택 4개, 페르소나 스타일) | `users.team_id` 저장 |
| 3.4 | `CopilotKitProvider` + `A2UIRenderer` + `CopilotChat` headless + 커스텀 테마 (팀 컬러 `data-team`) | 한화 선택 시 오렌지 악센트 |
| 3.5 | `useCopilotReadable` 6종 등록 (user/team/level/profile/game/recent) | 프롬프트 출력에 자동 포함 |
| 3.6 | PWA manifest + 서비스워커 등록 | Lighthouse PWA installability 통과 |

### P1 완료 조건 (M1)
- [x] 로컬 로그인 → 팀 선택 → `/chat` → "안녕" 전송 → Core 그래프 실행 → A2UI envelope 수신 → 카드 렌더
- [x] Langfuse에서 그래프 실행 트레이스 조회 가능
- [x] 토큰/비용이 trace 단위로 기록됨

---

## 4. Phase 2 — Core 그래프 + 한화 알파 (2~3주)

### 목표 (M2)
한화 팬이 스코어·잡담 등 실제 질의를 던지면 L0/L1/L2 경로를 모두 거쳐 A2UI 카드 + 페르소나 리액션 응답.

### W4: 가드레일 + IntentRouter + L0/L1 캐시

| # | DoD |
|---|-----|
| 4.1 | `IlbeMimFilter` + `SafetyFilter` + 프롬프트 해킹 패턴 (InputGuardrail 구현) | 금지 20건 차단 테스트 |
| 4.2 | `ChildSafetyGuardrail` (System Base 주입) | 시스템 프롬프트에 항상 포함 |
| 4.3 | `SemanticGuardrail` Flash-Lite 2단계 필터 | 우회 표현 10건 차단 |
| 4.4 | `LightweightIntentRouter` — intent 7종 + complexity 3단계 분류 | 샘플 30건 분류 정확도 95%+ |
| 4.5 | `CacheLookup` L0 구현 + `cache_ui_envelopes` 히트/미스 로직 + TTL 정리 배치 | HIT 시 LLM 호출 0건 확인 |
| 4.6 | Gemini Context Caching 시스템 프롬프트 캐시 (팀별 1 entry, TTL 1h) | 입력 토큰 ≤25% 과금 확인 |

### W5: ScoreGraph + DataAgent 크롤러 + A2UI Score 템플릿

| # | DoD |
|---|-----|
| 5.1 | `DataAgent` 스켈레톤 + KBO 공식 정적 페이지 Playwright 크롤러 (요청 간격 10s+) | 실경기 스코어 JSON |
| 5.2 | `cache_scores` 테이블 + 5분 TTL | 캐시 HIT <5ms |
| 5.3 | `ScoreGraph` subgraph: `{gameId?} → ScoreData` | 한화 경기 조회 성공 |
| 5.4 | A2UI 템플릿 `score_default` + `score_compact` + `score_emphasized` 3종 seed | L1 Template 경로 완성 |
| 5.5 | `DataFallbackHandler` — 크롤링 실패 시 팀별 페르소나 fallback 메시지 | 차단 시뮬레이션 통과 |

### W6: 한화 TeamPersona + L2 리액션 + PersonalAgent 초기버전

| # | DoD |
|---|-----|
| 6.1 | `HanwhaTeamPersona` 프롬프트 (service-plan §4.3) + TeamPersona 노드 inject | 리액션에 "~유" 사투리 확인 |
| 6.2 | L2 Partial LLM 경로: Template + `{{llm.reaction}}` 슬롯 | 50 out tokens 이내 감정 리액션 |
| 6.3 | `PersonalAgent` Service 기본 구현 + `buildContext()` | 컨텍스트 3섹션 (profile/session/hints) |
| 6.4 | `UIValidator` 풀 구현 — 팔레트·Schema·깊이·바인딩 검증 | 위반 케이스 차단 + Langfuse 이벤트 |
| 6.5 | `DataBinder` — LLM 리터럴 값 차단 + DB 바인딩 치환 | 수치 값 리터럴 테스트 차단 |
| 6.6 | `OutputGuardrail` — 출력 팩트체크 + 일베/비속어 재검증 | 수치 환각 샘플 자동 교체 |

### P2 완료 조건 (M2)
- [x] 한화 팬이 "지금 경기 어때?" → L0/L1/L2 3경로 시나리오 모두 왕복 성공
- [x] 일베 표현 차단 + 페르소나 fallback 정상
- [x] TTFB: L0 HIT <200ms / L2 <800ms
- [x] Langfuse에서 L0/L1/L2 분포 확인 가능

---

## 5. Phase 3 — 확장 (3~4주)

### 목표 (M3)
4팀 + 전 Service Subgraph + A2UI 도메인 widget 풀세트.

### W7: 3팀 TeamPersona + Stats/News Subgraph

| # | DoD |
|---|-----|
| 7.1 | 두산·기아·롯데 TeamPersona 프롬프트 (service-plan §4.2) | 각 팀 사투리 샘플 검증 |
| 7.2 | 3팀 컬러 토큰 추가 (`--team-doosan-*` 등) + `data-team` 스위칭 | 테마 전환 확인 |
| 7.3 | Statiz/KBReport 주 1회 배치 크롤러 + `batting_stats`/`pitching_stats` 적재 | 2026시즌 4팀 스탯 DB |
| 7.4 | `StatsGraph` subgraph + A2UI widget: `battingLineWidget`, `pitchingLineWidget`, `standingsRowWidget` | "문동주 ERA" 질의 시 카드 반환 |
| 7.5 | `NewsGraph` — Google News RSS 30분 배치 + Flash 요약 + `newsItemWidget` | 최신 KBO 뉴스 5건 |

### W8: Chat/Meme Subgraph + 도메인 widget 풀세트

| # | DoD |
|---|-----|
| 8.1 | `ChatGraph` — Flash + PersonalContext + TeamPersona | 잡담 왕복 |
| 8.2 | `MemeGraph` + `memes` 테이블 seed (팀별 10건) | 밈 응답 랜덤 |
| 8.3 | 추가 A2UI widget: `playerChipWidget`, `gameScheduleWidget`, `headToHeadWidget`, `trendSparkline`, `levelProgressWidget` | 전 widget 렌더 스냅샷 |
| 8.4 | A2UI L1 템플릿 풀세트 (intent별 compact/emphasized variant) | 템플릿 DB에 15+ rows |

### W9: L3 UIComposer + 세션 메모리 + 개인화 적응

| # | DoD |
|---|-----|
| 9.1 | L3 UIComposer: LLM이 A2UI spec 생성 + UIValidator 통과 + 재시도 1회 | 복합 질의 "문동주 vs 양의지 상대전적 + 올시즌" → 조합 카드 |
| 9.2 | 3단계 메모리: Working(20건) + Session 요약(Flash-Lite) + Long-term profile | 20건 초과 시 증분 요약 |
| 9.3 | 세션 종료 트리거 (30분/자정/명시적) + 최종 요약 | `conversations.summary` 자동 |
| 9.4 | `PersonalAgent.learnFromConversation` + Batch API (Flash-Lite 50% 할인) | 50건마다 프로필 갱신 |
| 9.5 | 지식 레벨 적응 UI: 초보→용어 설명 카드, 코어→세이버 카드 | profile.knowledgeLevel 기반 분기 |

### P3 완료 조건 (M3)
- [x] 4팀 모두 전 Service Subgraph 정상
- [x] 10종 A2UI widget 전부 렌더 가능
- [x] L3 UIComposer가 복합 질의에서 실제 동적 UI 생성
- [x] 세션 간 PersonalAgent 프로필 학습·반영

---

## 6. Phase 4 — 개인화·액션·레벨 (2주)

### 목표 (M4)
`useCopilotAction`으로 프론트 도메인 함수 툴콜 + 레벨 시스템 + 로컬 푸시.

### W10: Copilot Actions + Level + 커스텀 페르소나

| # | DoD |
|---|-----|
| 10.1 | `useCopilotAction` 도메인 함수 7종 (architecture §8): `registerFavoritePlayer`, `openPersonaEditor`, `jumpToConversation`, `toggleNotification`, `showPlayerDetail`, `requestScoreRefresh`, `showTeamComparison` | LLM이 툴 호출 → 프론트 액션 실행 |
| 10.2 | 툴콜 로그 `tool_call_logs` + Langfuse 연동 | 실행 내역 추적 |
| 10.3 | LevelAgent 규칙 5단계 + XP 증가 훅 | 대화 50회 달성 → Lv2 |
| 10.4 | `/my/level`, `/my/stats`, `/my/conversations` 페이지 | DB 실값 표시 |
| 10.5 | `/settings` 커스텀 페르소나 편집기(500자) + 저장 전 가드레일 | 일베 저장 거부 |

### W11: 로컬 Web Push + 푸시 트리거

| # | DoD |
|---|-----|
| 11.1 | VAPID 로컬 생성 + `PushProvider` 추상화 + SW 등록 | 로컬 Chrome 수신 성공 |
| 11.2 | 푸시 트리거 로직: 경기 시작 30분 전, 역전/동점, 관심 선수 활약, 레벨업 | 4종 유닛테스트 |
| 11.3 | `registerFavoritePlayer` 액션 → DB `user_favorites` + 활약 감지 알림 | E2E 시나리오 통과 |

### P4 완료 조건 (M4)
- [x] LLM이 프론트 액션 7종 모두 호출 성공
- [x] 레벨 Lv1→Lv2→Lv3 진행 가능
- [x] 로컬 푸시 4종 트리거 수신

---

## 7. Phase 5 — 안정화·로컬 RC (2주)

### 목표 (M5)
가드레일·비용·법무·부하 리스크 봉합. 본인 1주 자가 사용으로 `v1.0-rc`.

### W12: Admin + Rate Limit + 비용 상한

| # | DoD |
|---|-----|
| 12.1 | `/admin` 7섹션 (agents/core/users/personal-agents/data/guardrails/monitoring) | 각 섹션 조회 가능 |
| 12.2 | Admin Monitoring: Langfuse API로 일일 호출·비용·캐시히트율·latency 표시 | 실시간 대시보드 |
| 12.3 | Rate Limit (시간/일일/검색 별도) + 초과 시 429 + fallback | 100 req/h 제한 테스트 |
| 12.4 | 일일 LLM 비용 소프트·하드 상한 + 초과 시 알림(로컬 콘솔/Telegram stub) | ₩5,000 상한 테스트 |
| 12.5 | 반복 위반 자동 제재 (경고→1h 정지→Admin 알림) | 3회 위반 시 `blocked_until` |

### W13: 약관·부하·QA·RC

| # | DoD |
|---|-----|
| 13.1 | `/terms`, `/privacy`, `/about`, `/guide` 페이지 (비공식 고지 포함) | 법무 체크리스트 통과 |
| 13.2 | 크롤링 실패 연속 3회 → Crawler 자동 비활성 + Admin 알림 | 시뮬레이션 통과 |
| 13.3 | 프로세스 감시·자동 재시작 (pm2 로컬) | `kill -9` 후 자동 복구 |
| 13.4 | 부하 테스트 — k6로 동시 100명 시뮬레이션 | P95 <3s, 에러 <1% |
| 13.5 | 접근성 감사 + 반응형 QA (WCAG AA, 3 브레이크포인트) | Lighthouse a11y 95+ |
| 13.6 | 본인 1주 자가 사용 + 버그 로그 | 치명 버그 0건 |
| 13.7 | `v1.0-rc` 태그 + P6 이관 체크리스트 | 태그 생성 |

### P5 완료 조건 (M5 — 로컬 RC)
- [x] 자가 사용 안정
- [x] 월 LLM 비용 예상 ≤ ₩15,000
- [x] 일베/아동 탐지 0건 유출
- [x] Langfuse + Admin 대시보드 정상
- [x] `v1.0-rc` 태그

---

## 8. Phase 6 — 인프라 이관·베타 오픈 (1~2주)

### 목표 (M6)
Mac 로컬 RC를 Linux PC + 공개 도메인으로 이관, 베타 10명 오픈.

### 태스크

| # | DoD |
|---|-----|
| 14.1 | 도메인 `batdi.kr` 확보 + DNS | `nslookup` 응답 |
| 14.2 | Linux PC: Docker + PG 컨테이너(호스트 `54329` 동일 유지) + Langfuse | 컨테이너·기존 PG 양립 |
| 14.3 | DB dump/restore로 로컬 → Linux 마이그레이션 | 유저·대화 검증 |
| 14.4 | Cloudflare 계정 + Tunnel 연결 + Pages 배포 | `https://batdi.kr` 200 |
| 14.5 | Google OAuth 등록 + `AuthProvider` 어댑터 교체 (기존 이메일 유저와 `auth_id` 병합) | Google 계정 로그인 성공 |
| 14.6 | FCM 프로젝트 + `PushProvider` 어댑터 교체 + 실 VAPID 배포 | Android 실기기 수신 |
| 14.7 | UPS + systemd 자동 재시작 + 장애 페이지 | 정전 시뮬레이션 복구 |
| 14.8 | 베타 테스터 10명 초대 + 피드백 채널 | 10명 가입 |
| 14.9 | 1주 모니터링 → `v1.0` 태그 | 치명 버그 0건 |

### P6 완료 조건 (M6)
- [x] `https://batdi.kr` 공개
- [x] OAuth + FCM 실 동작
- [x] 베타 10명 1주 안정 사용
- [x] `v1.0` 정식 태그

---

## 9. 작업 흐름·의존성

```
P0 학습·PoC (1~2주) — CopilotKit+LangGraph+A2UI+Gemini 검증
  ↓
P1 기반 (3주) — NestJS+Next.js+CoreGraph minimal+이메일Auth+CopilotChat+A2UI E2E
  ↓
P2 Core그래프 (2~3주) — 가드레일+IntentRouter+L0/L1/L2+ScoreGraph+한화 페르소나
  ↓
P3 확장 (3~4주) — 3팀+Stats/News/Chat/Meme+10widget+L3 UIComposer+세션메모리+개인화
  ↓
P4 개인화·액션 (2주) — useCopilotAction 7종+레벨+로컬Push
  ↓
P5 안정화 (2주) — Admin+RateLimit+비용상한+부하테스트+약관+자가사용+v1.0-rc
  ↓
P6 인프라 이관 (1~2주) — Linux PC+도메인+CF+OAuth+FCM+v1.0 공개
```

---

## 10. 리스크·대응

| 리스크 | 발견 시기 | 대응 |
|--------|----------|------|
| CopilotKit/LangGraph 러닝커브 | P0 | PoC 4종으로 리스크 선노출 |
| A2UI Schema 위반 높음 | P2~P3 | UIValidator 재호출 1회 + L1 Template fallback |
| Statiz/KBO 봇 차단 | P0 | 다중 소스 fallback 즉시 설계 |
| 크롤링 사이트 변경 | P3~ | 추상화 계층 + 실패 3회 자동 비활성 |
| LangGraph state 복잡도 | P2~P3 | Langfuse 트레이스 + subgraph 격리 |
| L3 UIComposer 비용 초과 | P4~P5 | 일일 상한 + complexity 기준 보수적 |
| 이관 PC PG 충돌 | P6 | 호스트 포트 `54329` 고정 |
| OAuth 유저 매핑 | P6 | `AuthProvider` 추상화, `auth_id` 병합 경로 사전 설계 |
| iOS Web Push 제약 | P4~P6 | iOS 16.4+ 홈화면 추가 안내 UI |
| CopilotKit 업데이트 깨짐 | 전체 | 버전 고정 + 업데이트 시 통합 테스트 |

---

## 11. DoD 공통 기준

1. **빌드/타입체크**: `pnpm build`, `tsc --noEmit` 에러 0건
2. **테스트**: 해당 기능 유닛테스트 존재 + 통과
3. **Langfuse 트레이스**: LLM 호출은 모두 Langfuse에 기록
4. **문서 근거**: 구현이 [service-plan](./batdi-service-plan.md) + [architecture](./batdi-architecture.md)와 일치. 충돌 시 architecture 먼저 갱신
5. **UI 토큰**: 시각 속성은 [uiux-guideline](./batdi-uiux-guideline.md) 토큰만 참조
6. **실기기 확인**: 프론트 변경은 Chrome + 모바일 에뮬레이터 동작 확인 (P6에 Android 실기기)

---

## 12. 보류 항목 (service-plan §22)

P0~P6 범위 밖:
- 로고/마스코트 디자인
- 시즌 오프 전략
- Google Ads (1,000명+ 이후)
- 추가 6개 팀
- 소셜 기능
- 음성 인터페이스
- Semantic Cache / Persona Reaction Cache (검증 후 P7+)
- Claude/GPT 멀티 LLM 활성화 (MultiLLMAdapter 구조만 유지)

---

*v2 — CopilotKit·LangGraph·A2UI 전면 채택. 기술 세부는 [architecture](./batdi-architecture.md), UI 세부는 [uiux-guideline](./batdi-uiux-guideline.md) 참조.*
