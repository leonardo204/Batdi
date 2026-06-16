/**
 * JwtAuthGuard — httpOnly 쿠키(batdi_token) 기반 JWT 인증 가드
 *
 * - 요청 쿠키 batdi_token 에서 JWT 추출 → LocalAuthProvider.verify 로 검증.
 * - 검증 성공 시 req.user = { userId, email } 주입 → 컨트롤러가 사용.
 * - 쿠키 없음/검증 실패 시 UnauthorizedException(401).
 *
 * 쿠키 파싱은 main.ts 의 cookie-parser 미들웨어가 req.cookies 를 채운다(전제).
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { LocalAuthProvider } from './local-auth.provider';

/** 인증 후 요청에 부착되는 사용자 컨텍스트. */
export interface AuthenticatedUser {
  userId: string;
  email?: string;
}

/** req.user 가 주입된 요청 타입. 컨트롤러에서 캐스팅해 사용. */
export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authProvider: LocalAuthProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const token = cookies?.['batdi_token'];

    if (!token) {
      throw new UnauthorizedException('인증 토큰이 없습니다.');
    }

    try {
      // verifySession 은 검증된 신원 + JWT payload 의 sub(userId)를 함께 반환한다.
      // (verify 는 표준 AuthIdentity 만 노출하므로 userId 확정용 별도 메서드 사용)
      const { userId, identity } =
        await this.authProvider.verifySession(token);
      (req as RequestWithUser).user = {
        userId,
        ...(identity.email ? { email: identity.email } : {}),
      };
      return true;
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
  }
}
