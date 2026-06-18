/**
 * NotificationsController — 푸시 알림 on/off 토글 검증 엔드포인트 (P4-W10 10.1).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-050)
 *
 * POST /notifications/toggle (JwtAuthGuard)
 *  - 프론트 useCopilotAction('toggleNotification') 핸들러가 호출하는 백엔드 검증 API.
 *    키스톤 흐름(favorites 동일): 프론트 액션 → LLM tool_call → 클라 핸들러 →
 *    이 엔드포인트 → user.settings.notifications[type] 토글 + tool_call_logs 기록.
 *  - type 화이트리스트 검증(BadRequest). settings.notifications[type] 기본 true 가정 →
 *    첫 토글은 false. 본인(req.user.userId) settings 만 수정. ToolCallLog best-effort.
 *
 * ⚠️ LLM 악용 방지: type 은 서버 화이트리스트로 재검증한다. 소유자는 항상 req.user.userId.
 */
import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard, type RequestWithUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/** 토글 가능한 알림 타입 화이트리스트. */
const VALID_TYPES = [
  'gameStart',
  'gameEnd',
  'favoritePlayer',
  'levelUp',
] as const;
type NotificationType = (typeof VALID_TYPES)[number];

/** POST /notifications/toggle 요청 바디. */
interface ToggleBody {
  type?: unknown;
}

/** POST /notifications/toggle 응답. */
interface ToggleResult {
  type: NotificationType;
  enabled: boolean;
}

/** settings(JsonB) 의 알림 관련 형태. 그 외 임의 키는 보존한다. */
interface UserSettings {
  notifications?: Record<string, boolean>;
  [key: string]: unknown;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** 알림 토글(소유자=req.user) → settings.notifications[type] 반전 + ToolCallLog. */
  @UseGuards(JwtAuthGuard)
  @Post('toggle')
  async toggleNotification(
    @Req() req: RequestWithUser,
    @Body() body: ToggleBody,
  ): Promise<ToggleResult> {
    const start = Date.now();
    const userId = req.user.userId;

    // ── type 화이트리스트 검증 ──
    if (
      typeof body.type !== 'string' ||
      !VALID_TYPES.includes(body.type as NotificationType)
    ) {
      throw new BadRequestException(
        `type 은 ${VALID_TYPES.join('|')} 중 하나여야 합니다.`,
      );
    }
    const type = body.type as NotificationType;

    // ── 현재 settings 조회(본인) ──
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    const settings = this.readSettings(user.settings);
    const notifications = { ...(settings.notifications ?? {}) };
    // 기본 true 가정 → 첫 토글은 false. 이후 매 호출마다 반전.
    const current = notifications[type] ?? true;
    const enabled = !current;
    notifications[type] = enabled;

    const nextSettings: UserSettings = { ...settings, notifications };
    await this.prisma.user.update({
      where: { id: userId },
      data: { settings: nextSettings as Prisma.InputJsonValue },
    });

    const result: ToggleResult = { type, enabled };

    // ── ToolCallLog 기록(best-effort) ──
    try {
      await this.prisma.toolCallLog.create({
        data: {
          actionName: 'toggleNotification',
          params: { type },
          result: { type, enabled },
          durationMs: Date.now() - start,
        },
      });
    } catch {
      // 로그 실패는 무시 — 토글 자체는 이미 성공.
    }

    return result;
  }

  /** settings(JsonB) 를 안전하게 객체로 해석. null/배열/원시값은 빈 객체로 폴백. */
  private readSettings(raw: unknown): UserSettings {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as UserSettings;
    }
    return {};
  }
}
