/**
 * UsersController — 내 레벨·통계 조회 (P4-W10 10.4).
 *
 * SSOT: Ref-docs/specs/design/batdi-development-plan.md P4-W10 10.4
 *
 * - GET /users/me/level  (JwtAuthGuard) → 레벨/XP/진척률/해금/전체 레벨 히스토리.
 * - GET /users/me/stats  (JwtAuthGuard) → 대화수/메시지수/턴/관심선수수/레벨/XP.
 *
 * 소유자 범위: 항상 req.user.userId 기준(JWT). 레벨/XP 는 message_count 에서 재계산하지
 *   않고 User.xpPoints(write-through SSOT) 를 신뢰한다. (xpPoints 가 0 이면 Lv1.)
 *
 * 미구현(MVP): 예측 적중률·연속 활동일·활동 시간대는 데이터 소스 미구축이라 응답에서 제외.
 *   추후 prediction/activity 집계 추가 시 stats 에 필드 확장.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { toNormalizedForm, checkInputGuardrail } from '@batdi/guardrail';
import { JwtAuthGuard, type RequestWithUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { buildLevelInfo, type LevelInfo } from './level-rules';
import { requireLevel } from './level-guard';

/** GET /users/me/stats 응답. */
export interface UserStats {
  conversationCount: number;
  messageCount: number;
  turns: number;
  favoriteCount: number;
  level: number;
  xp: number;
}

/** custom_persona 최대 길이(자) — service-plan §3.5 / persona-guardrail §313. */
const CUSTOM_PERSONA_MAX_LEN = 500;

/** POST /users/me/persona 요청 바디. */
export interface SavePersonaBody {
  customPersona?: string;
}

/** GET /users/me/persona 응답. */
export interface PersonaResponse {
  customPersona: string | null;
}

/** POST /users/me/persona 성공 응답. */
export interface SavePersonaResult {
  customPersona: string | null;
  saved: true;
}

/** 커스텀 닉네임 최소/최대 길이(자) — ADR-053 (Lv5 해금). */
const NICKNAME_MIN_LEN = 1;
const NICKNAME_MAX_LEN = 20;

/** PATCH /users/me/nickname 요청 바디. */
export interface SaveNicknameBody {
  nickname?: string;
}

/** PATCH /users/me/nickname 성공 응답. */
export interface SaveNicknameResult {
  displayName: string;
  saved: true;
}

/**
 * MVP 우선 지원 팀 화이트리스트 — auth.controller VALID_TEAMS / @batdi/types TeamId 와 일치.
 * 팀 변경(PATCH /users/me/team) 입력 검증에 사용.
 */
const VALID_TEAMS = ['lotte', 'doosan', 'kia', 'hanwha'] as const;
type TeamId = (typeof VALID_TEAMS)[number];

/**
 * 데이터 보존기간 화이트리스트(일) — platform-ops §12.3.
 * 셀렉트 외 임의 값 차단(BadRequest).
 */
const VALID_RETENTION_DAYS = [30, 90, 180, 365] as const;
type RetentionDays = (typeof VALID_RETENTION_DAYS)[number];

/**
 * user.settings(JsonB) 의 알려진 형태. 그 외 임의 키(onboarded 등)는 보존한다.
 * - notifications: 알림 토글 맵(gameStart/gameEnd/favoritePlayer/levelUp 등).
 * - dataRetentionDays: 대화 보존기간(일, 화이트리스트).
 * - learningConsent: 개인화 학습 동의.
 */
export interface UserSettings {
  onboarded?: boolean;
  notifications?: Record<string, boolean>;
  dataRetentionDays?: number;
  learningConsent?: boolean;
  [key: string]: unknown;
}

/** PATCH /users/me/settings 요청 바디(부분 갱신 — 준 필드만 반영). */
export interface UpdateSettingsBody {
  notifications?: Record<string, boolean>;
  dataRetentionDays?: number;
  learningConsent?: boolean;
}

/** PATCH /users/me/settings 성공 응답. */
export interface UpdateSettingsResult {
  settings: UserSettings;
}

/** PATCH /users/me/team 요청 바디. */
export interface UpdateTeamBody {
  teamId?: string;
}

/** PATCH /users/me/team 성공 응답. */
export interface UpdateTeamResult {
  teamId: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  /** 내 레벨 정보 — User.xpPoints 로 레벨/진척률/해금 계산. */
  @UseGuards(JwtAuthGuard)
  @Get('me/level')
  async myLevel(@Req() req: RequestWithUser): Promise<LevelInfo> {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { xpPoints: true },
    });
    return buildLevelInfo(user?.xpPoints ?? 0);
  }

  /** 내 통계 — 대화/메시지/턴/관심선수/레벨 집계(소유자 범위). */
  @UseGuards(JwtAuthGuard)
  @Get('me/stats')
  async myStats(@Req() req: RequestWithUser): Promise<UserStats> {
    const userId = req.user.userId;

    const [user, state, conversationCount, favoriteCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { level: true, xpPoints: true },
      }),
      this.prisma.personalAgentState.findUnique({
        where: { userId },
        select: { messageCount: true },
      }),
      this.prisma.conversation.count({ where: { userId } }),
      this.prisma.userFavorite.count({ where: { userId } }),
    ]);

    const messageCount = state?.messageCount ?? 0;
    const xp = user?.xpPoints ?? 0;

    return {
      conversationCount,
      messageCount,
      // turns = floor(messageCount/2) (user+assistant=2/턴).
      turns: Math.floor(messageCount / 2),
      favoriteCount,
      level: user?.level ?? 1,
      xp,
    };
  }

  /**
   * 내 커스텀 페르소나 조회 (P4-W10 10.5) — personal_agent_state.customPersona.
   * 미설정/레코드 없음이면 null. 소유자 범위(req.user.userId).
   */
  @UseGuards(JwtAuthGuard)
  @Get('me/persona')
  async myPersona(@Req() req: RequestWithUser): Promise<PersonaResponse> {
    const state = await this.prisma.personalAgentState.findUnique({
      where: { userId: req.user.userId },
      select: { customPersona: true },
    });
    return { customPersona: state?.customPersona ?? null };
  }

  /**
   * 내 커스텀 페르소나 저장 (P4-W10 10.5) — 저장 전 가드레일 + 길이 검증.
   *
   * SSOT: persona-guardrail §313/§386-421, architecture ADR-051.
   *   1) 길이 검증: trim 길이 > 500 → BadRequest('500자 이내').
   *   2) 가드레일: toNormalizedForm → checkInputGuardrail(@batdi/guardrail 공유 SSOT).
   *      !pass 면 저장 안 하고 BadRequest { rejected:true, reason:violationType }.
   *   3) 빈 문자열(trim '')이면 customPersona=null 로 클리어 허용.
   *   4) pass → personal_agent_state upsert. (사용자 직접 저장이라 ToolCallLog 불필요.)
   *
   * prompt-builder 가 저장된 customPersona 를 <custom_persona>(priority=2)로 주입한다.
   */
  @UseGuards(JwtAuthGuard)
  @Post('me/persona')
  async savePersona(
    @Req() req: RequestWithUser,
    @Body() body: SavePersonaBody,
  ): Promise<SavePersonaResult> {
    const userId = req.user.userId;
    const raw = typeof body?.customPersona === 'string' ? body.customPersona : '';
    const trimmed = raw.trim();

    // 1) 길이 검증 (trim 기준).
    if (trimmed.length > CUSTOM_PERSONA_MAX_LEN) {
      throw new BadRequestException({
        rejected: true,
        reason: 'too_long',
        message: '페르소나는 500자 이내로 작성해줘.',
      });
    }

    // 3) 빈 문자열 → 클리어.
    if (trimmed === '') {
      await this.prisma.personalAgentState.upsert({
        where: { userId },
        update: { customPersona: null },
        create: { userId, customPersona: null },
      });
      return { customPersona: null, saved: true };
    }

    // 2) 가드레일 — 정규화 후 rule-based 검사(@batdi/guardrail 공유 SSOT).
    const normalized = toNormalizedForm(trimmed);
    const guard = checkInputGuardrail(normalized);
    if (!guard.pass) {
      throw new BadRequestException({
        rejected: true,
        reason: guard.violationType ?? 'guardrail',
      });
    }

    // 4) 통과 → 저장(원문 trim 보존, normalized 는 매칭 전용이라 저장 안 함).
    await this.prisma.personalAgentState.upsert({
      where: { userId },
      update: { customPersona: trimmed },
      create: { userId, customPersona: trimmed },
    });
    return { customPersona: trimmed, saved: true };
  }

  /**
   * 커스텀 닉네임 저장 (ADR-053) — Lv5(12번째 선수) 해금 기능.
   *
   *   1) 레벨 게이팅: user.level 조회 → requireLevel(level, 5). 미달 403 { locked }.
   *   2) 길이 검증: trim 길이 1~20 자 벗어나면 BadRequest('1~20자').
   *   3) 가드레일: toNormalizedForm → checkInputGuardrail(@batdi/guardrail 공유 SSOT).
   *      !pass 면 저장 안 하고 BadRequest { rejected:true, reason:violationType }.
   *   4) 통과 → user.displayName 갱신. 반환 { displayName, saved:true }.
   *
   * 현재 displayName 조회는 기존 GET /auth/me 로 가능하므로 신규 GET 은 두지 않는다.
   */
  @UseGuards(JwtAuthGuard)
  @Patch('me/nickname')
  async saveNickname(
    @Req() req: RequestWithUser,
    @Body() body: SaveNicknameBody,
  ): Promise<SaveNicknameResult> {
    const userId = req.user.userId;

    // 1) 레벨 게이팅 — 커스텀 닉네임은 Lv5 해금.
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { level: true },
    });
    requireLevel(me?.level ?? 1, 5);

    const raw = typeof body?.nickname === 'string' ? body.nickname : '';
    const trimmed = raw.trim();

    // 2) 길이 검증 (trim 기준 1~20자).
    if (trimmed.length < NICKNAME_MIN_LEN || trimmed.length > NICKNAME_MAX_LEN) {
      throw new BadRequestException({
        rejected: true,
        reason: 'invalid_length',
        message: '닉네임은 1~20자로 작성해줘.',
      });
    }

    // 3) 가드레일 — 정규화 후 rule-based 검사(@batdi/guardrail 공유 SSOT).
    const normalized = toNormalizedForm(trimmed);
    const guard = checkInputGuardrail(normalized);
    if (!guard.pass) {
      throw new BadRequestException({
        rejected: true,
        reason: guard.violationType ?? 'guardrail',
      });
    }

    // 4) 통과 → displayName 갱신(원문 trim 보존).
    await this.prisma.user.update({
      where: { id: userId },
      data: { displayName: trimmed },
    });
    return { displayName: trimmed, saved: true };
  }

  /**
   * 내 설정 부분 갱신 (platform-ops §12.3) — 알림/보존기간/학습동의.
   *
   *   - 기존 settings 를 readSettings 로 머지(onboarded 등 임의 키 보존).
   *   - 준 필드만 반영(부분 갱신). notifications 는 기존 맵과 얕은 머지.
   *   - dataRetentionDays 는 화이트리스트(30|90|180|365) 외 BadRequest.
   *   - user.settings update 후 머지된 settings 반환.
   */
  @UseGuards(JwtAuthGuard)
  @Patch('me/settings')
  async updateSettings(
    @Req() req: RequestWithUser,
    @Body() body: UpdateSettingsBody,
  ): Promise<UpdateSettingsResult> {
    const userId = req.user.userId;

    // 보존기간 화이트리스트 검증(준 경우만).
    if (body?.dataRetentionDays !== undefined) {
      const days = body.dataRetentionDays;
      if (!VALID_RETENTION_DAYS.includes(days as RetentionDays)) {
        throw new BadRequestException(
          `dataRetentionDays 는 ${VALID_RETENTION_DAYS.join('|')} 중 하나여야 합니다.`,
        );
      }
    }

    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });
    const prev = this.readSettings(me?.settings);
    const next: UserSettings = { ...prev };

    if (body?.notifications !== undefined) {
      // 알림 토글은 기존 맵과 얕은 머지(준 토글만 덮어씀).
      next.notifications = { ...(prev.notifications ?? {}), ...body.notifications };
    }
    if (body?.dataRetentionDays !== undefined) {
      next.dataRetentionDays = body.dataRetentionDays;
    }
    if (body?.learningConsent !== undefined) {
      next.learningConsent = body.learningConsent;
    }

    await this.prisma.user.update({
      where: { id: userId },
      // JsonB 컬럼 — Prisma InputJsonValue 캐스팅(UserSettings 는 index signature 보유).
      data: { settings: next as Prisma.InputJsonValue },
    });
    return { settings: next };
  }

  /**
   * 내 응원팀 변경 (platform-ops §12.3) — VALID_TEAMS 화이트리스트.
   *
   *   - teamId 가 lotte|doosan|kia|hanwha 외면 BadRequest.
   *   - user.teamId update 후 { teamId } 반환(프론트는 data-team 갱신).
   */
  @UseGuards(JwtAuthGuard)
  @Patch('me/team')
  async updateTeam(
    @Req() req: RequestWithUser,
    @Body() body: UpdateTeamBody,
  ): Promise<UpdateTeamResult> {
    const teamId = body?.teamId;
    if (!teamId || !VALID_TEAMS.includes(teamId as TeamId)) {
      throw new BadRequestException(
        `teamId 는 ${VALID_TEAMS.join('|')} 중 하나여야 합니다.`,
      );
    }
    await this.prisma.user.update({
      where: { id: req.user.userId },
      data: { teamId },
    });
    return { teamId };
  }

  /** settings(JsonB) 를 안전하게 객체로 해석. null/배열/원시값은 빈 객체로 폴백. */
  private readSettings(raw: unknown): UserSettings {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as UserSettings;
    }
    return {};
  }
}
