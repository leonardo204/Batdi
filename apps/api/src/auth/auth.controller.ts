/**
 * AuthController — 이메일(비밀번호 없음) 로그인 · 로그아웃 · 내정보 · 온보딩
 *
 * 세션은 httpOnly 쿠키 batdi_token(JWT access, 7d)로 운반한다.
 * - POST /auth/login    { email } → 쿠키 set + { user }
 * - POST /auth/logout   → 쿠키 clear + { ok }
 * - GET  /auth/me       (가드) → { user, onboarded }
 * - POST /auth/onboarding (가드) { teamId, personaStyle? } → { user }
 * - POST /auth/dev/mock-login  (비프로덕션 전용) → 고정 이메일 로그인
 *
 * 쿠키 옵션: httpOnly + sameSite:'lax' + maxAge 7d + path '/'.
 */

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { JwtAuthGuard, type RequestWithUser } from './jwt-auth.guard';

/** 쿠키 이름 — 가드(JwtAuthGuard)와 동일 키. */
const COOKIE_NAME = 'batdi_token';
/** 쿠키 maxAge(ms) = 7일 — JWT 만료와 정렬. */
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** MVP 우선 지원 팀 화이트리스트(@batdi/types domain.ts TeamId 와 일치). */
const VALID_TEAMS = ['lotte', 'doosan', 'kia', 'hanwha'] as const;
type TeamId = (typeof VALID_TEAMS)[number];
/** 비프로덕션 mock 로그인 고정 이메일. */
const MOCK_EMAIL = 'mock@batdi.kr';

interface LoginBody {
  email?: string;
}
interface OnboardingBody {
  teamId?: string;
  personaStyle?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 이메일 로그인 — user upsert 후 JWT 쿠키 set. */
  @Post('login')
  async login(
    @Body() body: LoginBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: User }> {
    const email = body?.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('email 이 필요합니다.');
    }
    const { user, tokens } = await this.auth.login(email);
    this.setAuthCookie(res, tokens.accessToken);
    return { user };
  }

  /** 로그아웃 — 세션 쿠키 제거. */
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  /** 내정보 — 가드 통과 후 현재 사용자 + 온보딩 여부 반환. */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(
    @Req() req: RequestWithUser,
  ): Promise<{ user: User; onboarded: boolean }> {
    const user = await this.auth.getMe(req.user.userId);
    const settings = this.auth.readSettings(user.settings);
    return { user, onboarded: settings.onboarded === true };
  }

  /** 온보딩 — 응원팀/페르소나 확정. teamId 화이트리스트 검증. */
  @UseGuards(JwtAuthGuard)
  @Post('onboarding')
  async onboarding(
    @Req() req: RequestWithUser,
    @Body() body: OnboardingBody,
  ): Promise<{ user: User }> {
    const teamId = body?.teamId;
    if (!teamId || !VALID_TEAMS.includes(teamId as TeamId)) {
      throw new BadRequestException(
        `teamId 는 ${VALID_TEAMS.join('|')} 중 하나여야 합니다.`,
      );
    }
    const user = await this.auth.completeOnboarding(
      req.user.userId,
      teamId,
      body?.personaStyle,
    );
    return { user };
  }

  /**
   * 개발 편의용 mock 로그인 — 고정 이메일로 즉시 로그인.
   * 프로덕션에서는 비활성(ForbiddenException). 비밀번호/UI 없이 세션 확보용.
   */
  @Post('dev/mock-login')
  async mockLogin(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: User }> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('mock-login 은 프로덕션에서 사용할 수 없습니다.');
    }
    const { user, tokens } = await this.auth.login(MOCK_EMAIL);
    this.setAuthCookie(res, tokens.accessToken);
    return { user };
  }

  /** 표준 세션 쿠키 set 헬퍼(login·mock-login 공용). */
  private setAuthCookie(res: Response, accessToken: string): void {
    res.cookie(COOKIE_NAME, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    });
  }
}
