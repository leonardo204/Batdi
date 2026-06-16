/**
 * AuthProvider 인터페이스 + DI 토큰
 *
 * SSOT: Ref-docs/specs/interface/batdi-provider-interfaces.md §2
 * - 인증을 외부 벤더에 직접 결합하지 않고 인터페이스로 추상화한다.
 * - 로컬(P1)은 LocalAuthProvider(이메일+JWT), P6는 GoogleOAuthProvider 어댑터가
 *   동일 인터페이스를 만족 → 호출부(AuthService·Guard)는 교체를 인지하지 못한다.
 * - DI 바인딩은 AUTH_PROVIDER 환경변수('local'|'google')로 선택(§4-2).
 */

/**
 * 인증 공유 타입 (SSOT: packages/types/src/auth.ts = provider-interfaces §1).
 *
 * api 패키지는 tsconfig(Node16/CommonJS)가 ESM 패키지 `@batdi/types` 소스를
 * 직접 끌어오면 모듈해상도(ESM 확장자) 충돌이 나므로, 동일 시그니처를 본 파일에
 * 재선언해 단일 책임(인증 계약) 안에서 사용한다. 시그니처 변경 시 양쪽을 함께 갱신한다.
 */

/** 인증 어댑터 식별자. 'local'=이메일+JWT(P1), 'google'=P6 OAuth. */
export type AuthProviderId = 'local' | 'google';

/** 외부/로컬 인증 주체를 표준화한 식별자(db-schema users.auth_provider/auth_id 매핑). */
export interface AuthIdentity {
  provider: AuthProviderId;
  authId: string;
  email?: string;
  displayName?: string;
}

/** 세션 토큰 쌍(로컬 JWT access(+refresh)). expiresAt=epoch ms. */
export interface TokenPair {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/** NestJS DI 토큰 — 호출부는 이 토큰으로 구체 구현(Local/Google)을 주입받는다. */
export const AUTH_PROVIDER = 'AUTH_PROVIDER';

export interface AuthProvider {
  /** 어댑터 식별. 'local'=이메일+JWT, 'google'=P6 OAuth. → users.auth_provider 매핑. */
  getProviderId(): AuthProviderId;

  /**
   * 토큰(로컬 JWT access / P6 OAuth id_token·code)을 검증해 표준 신원으로 변환.
   * @param token 클라이언트가 제시한 인증 토큰
   * @returns 검증된 AuthIdentity
   * @throws InvalidTokenError(만료/서명불일치), ProviderUnavailableError(P6 검증 장애)
   */
  verify(token: string): Promise<AuthIdentity>;

  /**
   * 로그인 성공한 사용자에게 세션 토큰을 발급.
   * @param user 발급 대상 (id·email·providerId)
   * @returns access(+refresh) 토큰 쌍
   * @throws TokenIssueError
   */
  issue(user: {
    id: string;
    email?: string;
    providerId: AuthProviderId;
  }): Promise<TokenPair>;

  /**
   * P6 OAuth 도입 시: 외부 신원을 기존 로컬(이메일) 유저에 병합.
   * 로컬 단독 운영 시점에는 no-op 또는 미구현 가능(로컬 어댑터는 throw NotSupported 허용).
   * @throws IdentityConflictError, MergeNotSupportedError(로컬 어댑터)
   */
  mergeIdentity(
    existingUserId: string,
    externalIdentity: AuthIdentity,
  ): Promise<AuthIdentity>;
}
