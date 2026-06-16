import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

interface HealthResponse {
  status: 'ok' | 'degraded';
  service: 'batdi-api';
  db: 'up' | 'down';
  timestamp: string;
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    // PgBouncer(54330) 경유 DB 연결 확인 — 가벼운 SELECT 1.
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      service: 'batdi-api',
      db,
      timestamp: new Date().toISOString(),
    };
  }
}
