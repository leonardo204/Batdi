---
id: batdi-copilot-actions
title: 밧디 useCopilotAction 도메인 함수 계약
type: interface
version: 0.1.0
status: approved
scope: 프론트 useCopilotAction 툴콜 7종 — 파라미터·효과·백엔드 검증 API 1:1 매핑 규칙
related: [batdi-architecture]
updated: 2026-06-12
---

## 8. 프론트 `useCopilotAction` 도메인 함수

LLM이 직접 호출 가능한 프론트 함수 (툴콜):

| Action | 파라미터 | 효과 |
|--------|---------|-----|
| `registerFavoritePlayer` | `playerId` | 관심 선수 등록 + DB 반영 |
| `openPersonaEditor` | — | 설정 모달 오픈 |
| `jumpToConversation` | `conversationId` | 대화 페이지 이동 |
| `toggleNotification` | `type` | 푸시 알림 on/off |
| `showPlayerDetail` | `playerId` | 선수 상세 오버레이 |
| `requestScoreRefresh` | `gameId` | 스코어 강제 갱신 |
| `showTeamComparison` | `teamA, teamB` | 팀 비교 뷰 |

모든 action은 백엔드 검증 API와 1:1 매핑. LLM 악용 방지.
