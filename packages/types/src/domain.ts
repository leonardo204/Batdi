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

/** IntentRouter 결과 (LLM 미사용 — 키워드·정규식 라우팅) */
export type Intent = 'score' | 'news' | 'stat' | 'schedule' | 'chat';
