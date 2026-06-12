# specs — 프로젝트 스펙 문서 (SDD)

- 가이드라인: [`../claude/sdd.md`](../claude/sdd.md)
- 정합성 분석: `/spec-guard` (영향도·중복·범위·누락·버전)
- 분류: `design/`(무엇·왜·구조) · `impl/`(순서·태스크·수용기준) · `interface/`(계약·메시지·DDL) · `test/`(검증)
- 모든 문서는 SDD frontmatter(`id`/`type`/`version`/`status`/`scope`/`related`)로 시작하며, 상호참조는 `related`의 **id**로 연결한다.

## 문서 인덱스

### design/ — 설계 (기획·기술·UX)
| id | 문서 | scope |
|----|------|-------|
| `batdi-service-plan` | [batdi-service-plan.md](design/batdi-service-plan.md) | 서비스 개요·전체 아키텍처·웹/스택/비용/법무/리스크/로드맵 (기획 SSOT 진입점) |
| `batdi-persona-guardrail` | [batdi-persona-guardrail.md](design/batdi-persona-guardrail.md) | Personal Agent·팀 페르소나·모델 라우팅·가드레일·개인화·멀티턴 |
| `batdi-platform-ops` | [batdi-platform-ops.md](design/batdi-platform-ops.md) | Data Agent 크롤링·안정성/성능/환각방지·캐시/DB·회원·레벨·푸시·Admin |
| `batdi-architecture` | [batdi-architecture.md](design/batdi-architecture.md) | CopilotKit·LangGraph CoAgents·4단계 캐시·ADR (기술 SSOT) |
| `batdi-uiux-guideline` | [batdi-uiux-guideline.md](design/batdi-uiux-guideline.md) | 디자인 토큰·A2UI 팔레트·접근성·디자이너 핸드오프 |

### impl/ — 구현 계획
| id | 문서 | scope |
|----|------|-------|
| `batdi-development-plan` | [batdi-development-plan.md](impl/batdi-development-plan.md) | P0~P6 Phase별 태스크·DoD·의존성 |
| `batdi-pre-dev-checklist` | [batdi-pre-dev-checklist.md](impl/batdi-pre-dev-checklist.md) | P0 착수 전 결정·준비 종합 게이트 (설계공백·환경·테스트·보안) |

### interface/ — 계약 (LLM·프론트·DB가 직접 참조)
| id | 문서 | scope |
|----|------|-------|
| `batdi-agui-contract` | [batdi-agui-contract.md](interface/batdi-agui-contract.md) | AG-UI 메시지 시퀀스·이벤트 타입·툴 응답 계약 |
| `batdi-a2ui-palette-schema` | [batdi-a2ui-palette-schema.md](interface/batdi-a2ui-palette-schema.md) | A2UI 팔레트·widget 10종·UIValidator JSON Schema·바인딩 규칙 |
| `batdi-copilot-actions` | [batdi-copilot-actions.md](interface/batdi-copilot-actions.md) | useCopilotAction 툴콜 7종 시그니처·백엔드 검증 매핑 |
| `batdi-db-schema` | [batdi-db-schema.md](interface/batdi-db-schema.md) | PostgreSQL 16 스키마 DDL·인덱스·커넥션 풀 전략 (DB SSOT) |
| `batdi-routing` | [batdi-routing.md](interface/batdi-routing.md) | IntentRouter intent enum·complexity + MultiLLMAdapter 모델 결정표·폴백 (라우팅 SSOT) |
| `batdi-provider-interfaces` | [batdi-provider-interfaces.md](interface/batdi-provider-interfaces.md) | AuthProvider/PushProvider 시그니처 — 로컬 + P6 어댑터 교체 계약 |

### test/ — 테스트 계획
| id | 문서 | scope |
|----|------|-------|
| `batdi-test-plan` | [batdi-test-plan.md](test/batdi-test-plan.md) | P0~P6 DoD 검증 + 가드레일·팩트환각·4단계 캐시 핵심 테스트 |

## 의존 흐름

```
design (service-plan · persona-guardrail · platform-ops · architecture · uiux)
  → impl (development-plan)
  → interface (agui-contract · a2ui-palette-schema · copilot-actions · db-schema)
  → test (test-plan)
```
