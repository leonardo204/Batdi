/**
 * 인증 공유 타입 (Auth Provider 추상화 계약)
 *
 * SSOT: Ref-docs/specs/interface/batdi-provider-interfaces.md §1
 * - AuthProvider/PushProvider 추상화로 로컬(이메일+JWT)과 P6 어댑터(Google OAuth)를
 *   호출부 무변경으로 교체한다. 본 파일은 §1 "공유 타입(인증)" 시그니처를 그대로 옮긴다.
 * - db-schema users.auth_provider('email'|'google') + auth_id(VARCHAR(255))에 1:1 매핑.
 *
 * ⚠️ 시그니처 변경 시 provider-interfaces.md version bump + 영향도 검토 필요(§4-4).
 */

/** 인증 어댑터 식별자. 'local'=이메일+JWT(P1), 'google'=P6 OAuth. */
export type AuthProviderId = 'local' | 'google';

/**
 * 외부/로컬 인증 주체를 표준화한 식별자.
 * db-schema `users.auth_provider`('email'|'google') + `auth_id`(VARCHAR(255))에 매핑.
 */
export interface AuthIdentity {
  /** 'local' → users.auth_provider='email', 'google' → 'google' */
  provider: AuthProviderId;
  /** → users.auth_id. 로컬=이메일 정규화 키, Google=sub 클레임 */
  authId: string;
  /** → users.email (검증된 경우만) */
  email?: string;
  /** → users.display_name 초기값 후보 */
  displayName?: string;
}

/**
 * 세션 토큰 쌍.
 * 로컬은 JWT(access)+refresh, P6 OAuth는 어댑터가 자체 토큰을 동일 형태로 래핑.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken?: string;
  /** epoch ms (access 만료) */
  expiresAt: number;
}
