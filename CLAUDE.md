# Claude Code 개발 가이드

> 공통 규칙(Agent Delegation, 커밋 정책, Context DB 등)은 글로벌 설정(`~/.claude/CLAUDE.md`)을 따릅니다.
> 글로벌 미설치 시: `curl -fsSL https://raw.githubusercontent.com/leonardo204/dotclaude/main/install.sh | bash`

---

## Slim 정책

이 파일은 **100줄 이하**를 유지한다. 새 지침 추가 시:
1. 매 턴 참조 필요 → 이 파일에 1줄 추가
2. 상세/예시/테이블 → ref-docs/*.md에 작성 후 여기서 참조
3. ref-docs 헤더: `# 제목 — 한 줄 설명` (모델이 첫 줄만 보고 필요 여부 판단)

---

## PROJECT

### 개요

**밧디 (batdi)** — KBO 야구 전문 Agentic Chatbot. bat + buddy, "너의 야구 친구".
1인 사이드 프로젝트 · 장기 설계 우선 · MVP 100명. 우선 지원 팀: 롯데 · 두산 · 기아 · 한화.

| 항목 | 값 |
|------|-----|
| 도메인 (P6+) | batdi.kr (1차) |
| 프론트 | **Next.js 14+ App Router** + React 18 + Tailwind + **CopilotKit + A2UI** + PWA |
| 백엔드 | **NestJS** + `copilotRuntimeNestEndpoint` + **LangGraph.js (계층적 CoAgents)** |
| DB | PostgreSQL 16 단일 (Docker, 포트 `54329`) |
| LLM | Gemini 2.5 Flash/Lite/Pro + 3 Flash + **Context Caching (75% 할인)** |
| 관측 | **Langfuse 셀프호스팅** (비용 0) |
| 인프라 (P6+) | 로컬 Linux PC + Cloudflare Tunnel + Pages |

### 상세 문서

- **[시스템 아키텍처](docs/plan/batdi-architecture.md)** — **기술 기준점 SSOT**. AG-UI 계약·LangGraph State·A2UI 팔레트·4단계 캐시·ADR. 구현 전 이 문서를 먼저 갱신
- **[서비스 플랜 v8](docs/plan/batdi-service-plan.md)** — 서비스 기획·가드레일·페르소나·DB 스키마 (근본 기획서)
- **[개발 계획서 v2](docs/plan/batdi-development-plan.md)** — P0~P6 Phase별 태스크, DoD, 의존성 (Mac 로컬 + P6 인프라 이관)
- **[UI/UX 디자인 지침 v2](docs/plan/batdi-uiux-guideline.md)** — 디자인 토큰·A2UI 팔레트·CopilotChat 통합·디자이너 핸드오프
- [Context DB](Ref-docs/claude/context-db.md) — SQLite 기반 세션/태스크/결정 저장소
- [Context Monitor](Ref-docs/claude/context-monitor.md) — HUD + compaction 감지/복구
- [컨벤션](Ref-docs/claude/conventions.md) — 커밋 · 주석 · 로깅 · **Mermaid 다이어그램** 규칙 (코드 룰만이 아님)
- [셋업](Ref-docs/claude/setup.md) — 새 환경 초기 설정

### 핵심 규칙 (문서 SSOT)

- **기술 결정은 architecture.md가 SSOT**: 기술·구조 변경은 [architecture](docs/plan/batdi-architecture.md) 먼저 갱신 후 구현. ADR 섹션에 결정 기록
- **기획 결정은 service-plan.md가 SSOT**: 페르소나·가드레일·서비스 플로우 변경은 [service-plan](docs/plan/batdi-service-plan.md) 먼저 갱신
- **팩트(수치)는 절대 LLM이 생성 금지**: DB → DataBinder → `{{bind:"path"}}` 참조만. LLM 리터럴 값 출력 시 UIValidator 차단
- **UI 구조는 LLM이 동적 선택 가능**: 단, A2UI 화이트리스트 팔레트 + JSON Schema + 깊이 제한(4단계, 30노드)으로 통제
- **감정 리액션은 `{{llm.reaction}}` 슬롯만**: 텍스트에 수치 언급 금지 (프롬프트 + OutputGuardrail 이중 검증)
- **4단계 캐시 우선순위**: L0 Envelope → L1 Template → L2 Partial → L3 Full. 항상 상위 레벨부터 시도
- **프롬프트 계층**: `System Base (불변) > User Custom Persona > PersonalAgent Profile > Team Persona`
- **IntentRouter는 LLM 미사용**: 키워드·정규식 라우팅. 미매칭 → `chat` 기본값
- **Gemini Context Caching 필수**: 팀별 시스템 프롬프트 캐시 (75% 입력 토큰 할인)
- **크롤링 부하 제한**: 요청 간격 10초+·동시 1·robots.txt 준수. 금지: 네이버/다음
- **가드레일 3중 검증**: Input(일베/비속어/프롬프트해킹/아동보호/Semantic) + Output(팩트체크/비속어 재검증) + 커스텀 페르소나 저장 시
- **무료 할당 우선**: Gemini 3 Flash 5K/월, 2.5 Flash 500 RPD → FreeQuotaTracker
- **Service Subgraph 추가 절차**: 기존 subgraph capability 확장 > 신규 subgraph 추가 + Core IntentRouter에 routing
- **로컬 우선 개발 (P0~P5)**: 모두 Mac 로컬. PostgreSQL Docker 포트 `54329` 고정. 외부 의존성(도메인/CF/OAuth/FCM)은 P6에서만
- **Auth/Push Provider 추상화 필수**: `AuthProvider`/`PushProvider` 인터페이스 유지 → P6에 Google OAuth/FCM 어댑터 교체
- **Langfuse 트레이스 필수**: 모든 LLM 호출·LangGraph 노드·캐시 히트/미스 기록
- **UI 시각 속성은 토큰만 참조**: 하드코딩 색상/간격 금지. `packages/ui/src/tokens.css` CSS variables만 사용
- **팀 컬러는 `data-team` 속성 스위치**: `--team-primary` 변수만 참조
- **CopilotKit `useCopilotReadable`로 상태 노출**: user/team/level/profile/game/recent는 자동 컨텍스트, 프롬프트 중복 금지
- **CopilotKit `useCopilotAction` 툴은 백엔드 검증 API와 1:1 매핑**: LLM 악용 방지
- **Mermaid 다이어그램 작성 시 [컨벤션](Ref-docs/claude/conventions.md) 준수**: 노드 라벨 `()` 괄호 금지(`—`/쉼표로 대체), `\n` 금지(`<br>` 사용), 마크다운 문법(`#`, `**`, `` ` ``) 금지, 넘버링은 `A.` `B.` 문자 사용. 컨벤션 문서는 코드 룰뿐 아니라 다이어그램 룰도 포함

---

*최종 업데이트: 2026-04-04*
