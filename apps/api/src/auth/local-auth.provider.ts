/**
 * LocalAuthProvider — 로컬(P1) 이메일+JWT 인증 어댑터
 *
 * SSOT: Ref-docs/specs/interface/batdi-provider-interfaces.md §2 (LocalAuthProvider 행)
 * - getProviderId → 'local'
 * - verify: JWT access 토큰 서명·만료 검증 → AuthIdentity
 * - issue: JwtService 로 access 토큰 발급(payload {sub,email}, 7d)
 * - mergeIdentity: 로컬은 no-op → MergeNotSupportedError throw
 *
 * JWT_SECRET 은 env(JwtModule.register secret)로 주입된다. 시크릿 하드코딩 금지.
 */

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  AuthIdentity,
  AuthProvider,
  AuthProviderId,
  TokenPair,
} from './auth.provider';

/** JWT payload 형태 (sub=users.id, email=검증 이메일) */
interface JwtPayload {
  sub: string;
  email?: string;
}

/** access 토큰 만료 기간(7일) — 초/밀리초 환산에 공용으로 사용. */
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class LocalAuthProvider implements AuthProvider {
  constructor(private readonly jwt: JwtService) {}

  getProviderId(): AuthProviderId {
    return 'local';
  }

  /** JWT access 토큰 검증 → 표준 신원. 로컬은 authId=email 규약(provider-interfaces §1). */
  async verify(token: string): Promise<AuthIdentity> {
    // verifyAsync 는 서명 불일치/만료 시 throw → 호출부(Guard)가 401 로 변환한다.
    const payload = await this.jwt.verifyAsync<JwtPayload>(token);
    const email = payload.email;
    return {
      provider: 'local',
      authId: email ?? payload.sub,
      ...(email ? { email } : {}),
    };
  }

  /**
   * 세션 검증 — JWT 를 검증해 표준 신원 + userId(payload.sub)를 함께 반환.
   * Guard 가 req.user.userId 를 채우기 위해 sub 가 필요하므로 verify 와 분리 제공.
   * @throws JWT 검증 실패 시 throw(서명/만료)
   */
  async verifySession(
    token: string,
  ): Promise<{ userId: string; identity: AuthIdentity }> {
    const payload = await this.jwt.verifyAsync<JwtPayload>(token);
    const email = payload.email;
    return {
      userId: payload.sub,
      identity: {
        provider: 'local',
        authId: email ?? payload.sub,
        ...(email ? { email } : {}),
      },
    };
  }

  /** access 토큰 발급. payload {sub:userId, email}, 만료 7d. */
  async issue(user: {
    id: string;
    email?: string;
    providerId: AuthProviderId;
  }): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      ...(user.email ? { email: user.email } : {}),
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: TOKEN_TTL_SECONDS,
    });
    return {
      accessToken,
      expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000,
    };
  }

  /** 로컬 단독 운영 — 신원 병합 미지원(P6 GoogleOAuthProvider 가 구현). */
  async mergeIdentity(
    _existingUserId: string,
    _externalIdentity: AuthIdentity,
  ): Promise<AuthIdentity> {
    throw new Error('MergeNotSupportedError');
  }
}
