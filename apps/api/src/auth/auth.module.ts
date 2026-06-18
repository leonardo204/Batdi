/**
 * AuthModule — 이메일+JWT 인증 (P1)
 *
 * - JwtModule.register: secret=JWT_SECRET(env), 기본 만료 7d.
 * - AUTH_PROVIDER 토큰 → LocalAuthProvider 바인딩(P6 에 GoogleOAuthProvider 로 교체).
 * - AuthService 를 exports 하여 다른 모듈(미들웨어/Subgraph)에서 사용 가능.
 *
 * PrismaService 는 전역 PrismaModule(@Global)에서 주입된다.
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LocalAuthProvider } from './local-auth.provider';
import { AUTH_PROVIDER } from './auth.provider';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalAuthProvider,
    JwtAuthGuard,
    // 호출부가 AuthProvider 추상 토큰으로도 주입받을 수 있게 동일 인스턴스 연결.
    { provide: AUTH_PROVIDER, useExisting: LocalAuthProvider },
  ],
  // JwtAuthGuard/LocalAuthProvider 도 export — 다른 모듈(ConversationModule 등)이 가드를
  // 적용하려면 DI 컨텍스트에 가드와 그 의존성(LocalAuthProvider)이 있어야 한다.
  exports: [AuthService, JwtAuthGuard, LocalAuthProvider],
})
export class AuthModule {}
