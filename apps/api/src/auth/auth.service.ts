/**
 * AuthService — 이메일(비밀번호 없음) 로그인 + 온보딩 도메인 로직
 *
 * SSOT: provider-interfaces §2(AuthProvider) + db-schema users 테이블.
 * - login(email): user upsert(신규=임시 hanwha/onboarded:false) → LocalAuthProvider.issue
 * - completeOnboarding: teamId/personaStyle 갱신 + settings.onboarded=true
 * - getMe: 현재 사용자 조회
 *
 * teamId 는 NOT NULL 이므로 신규 로그인 시 임시값('hanwha')으로 채우고,
 * 온보딩에서 실제 응원팀으로 갱신한다(요구사항 제약). password 컬럼은 존재하지 않는다.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TokenPair } from './auth.provider';
import { LocalAuthProvider } from './local-auth.provider';

/** settings(JsonB) 의 온보딩 관련 형태. 그 외 임의 키는 보존한다. */
interface UserSettings {
  onboarded?: boolean;
  [key: string]: unknown;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authProvider: LocalAuthProvider,
  ) {}

  /**
   * 이메일 로그인 — user upsert 후 세션 토큰 발급.
   * 신규: teamId 임시 'hanwha', authProvider 'email', settings.onboarded=false.
   * 기존: lastActive 갱신만.
   */
  async login(email: string): Promise<{ user: User; tokens: TokenPair }> {
    const user = await this.prisma.user.upsert({
      where: { email },
      create: {
        email,
        teamId: 'hanwha',
        authProvider: 'email',
        authId: email,
        settings: { onboarded: false },
      },
      update: {
        lastActive: new Date(),
      },
    });

    const tokens = await this.authProvider.issue({
      id: user.id,
      email: user.email ?? undefined,
      providerId: 'local',
    });

    return { user, tokens };
  }

  /**
   * 온보딩 완료 — 응원팀/페르소나 확정 + settings.onboarded=true.
   * 기존 settings 의 다른 키는 보존한다.
   */
  async completeOnboarding(
    userId: string,
    teamId: string,
    personaStyle?: string,
  ): Promise<User> {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!current) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    const prevSettings = this.readSettings(current.settings);
    const nextSettings: UserSettings = { ...prevSettings, onboarded: true };

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        teamId,
        ...(personaStyle ? { personaStyle } : {}),
        // JsonB 컬럼 — Prisma InputJsonValue 로 캐스팅(UserSettings 는 index signature 보유).
        settings: nextSettings as Prisma.InputJsonValue,
      },
    });
  }

  /** 현재 사용자 조회. 없으면 throw(토큰은 유효하나 유저가 삭제된 경우). */
  async getMe(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    return user;
  }

  /** settings(JsonB) 를 안전하게 객체로 해석. null/배열/원시값은 빈 객체로 폴백. */
  readSettings(raw: User['settings']): UserSettings {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as UserSettings;
    }
    return {};
  }
}
