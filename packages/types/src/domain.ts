/**
 * 도메인 타입 stub (P0 골격)
 *
 * SSOT: Ref-docs/specs/design/batdi-service-plan.md (페르소나·스키마)
 * 정식 DDL SSOT: interface/batdi-db-schema (추후)
 *
 * ⚠️ 본 파일은 최소 골격 stub. 실제 스키마는 P1 이후 Prisma/DDL 기준으로 확정.
 */

/** MVP 우선 지원 KBO 팀 (롯데·두산·기아·한화) */
export type TeamId = 'lotte' | 'doosan' | 'kia' | 'hanwha';

/** 야구 지식 레벨 (페르소나 톤 분기용) */
export type FanLevel = 'rookie' | 'casual' | 'core' | 'hardcore';

/** UI 테마 */
export type ThemeMode = 'dark' | 'light';

/** 사용자 프로필 (PersonalAgent 입력 stub) */
export interface UserProfile {
  id: string;
  /** 응원 팀 (data-team 속성 스위치 키) */
  team: TeamId | null;
  level: FanLevel;
  /** 커스텀 페르소나 (가드레일 통과 후 저장) */
  customPersona?: string | null;
  theme: ThemeMode;
}

/**
 * IntentRouter 결과 (LLM 미사용 — 키워드·정규식 라우팅)
 *
 * SSOT: Ref-docs/specs/interface/batdi-routing.md §2 (canonical 7종)
 * - `standings`는 별도 intent가 아니라 `stats` 하위(`statType='standings'`)로 흡수.
 * - 미매칭 시 `chat`이 기본값(fallthrough).
 */
export type Intent =
  | 'score' // 실시간 스코어·경기 진행
  | 'stats' // 선수/팀 통계 (순위·승률 = statType:'standings' 하위)
  | 'news' // 뉴스·기사·소식
  | 'schedule' // 경기 일정
  | 'lineup' // 선발·라인업
  | 'meme' // 밈·유머
  | 'chat'; // 잡담 (미매칭 기본값)

/**
 * 가드레일 검사 결과 (Input/Output 공용 stub)
 *
 * SSOT: Ref-docs/specs/design/batdi-persona-guardrail.md §6.2 (입력 가드레일)
 * P2-W4: rule-based 입력 가드레일(IlbeMim/프롬프트해킹/비속어 등) 차단 시
 *   violationType + fallbackResponse 를 채워 반환한다(SemanticGuardrail은 범위 밖).
 */
export interface GuardrailResult {
  /** 통과 여부 */
  pass: boolean;
  /** 차단 사유 코드 (pass=false 일 때) — 레거시 호환 필드 */
  reason?: string;
  /**
   * 위반 유형 (pass=false 일 때).
   * 'ilbe_expression' | 'prompt_injection' | 'profanity' | 'insult'
   * | 'threat' | 'gambling' | 'self_harm' 등.
   */
  violationType?: string;
  /** 차단 시 사용자에게 보일 페르소나 응답 문구 (SSOT §6.2 응답표) */
  fallbackResponse?: string;
}
