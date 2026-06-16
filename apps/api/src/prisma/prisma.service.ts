import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — NestJS 생명주기에 PrismaClient 연결을 묶는다.
 *
 * 런타임 연결은 DATABASE_URL(PgBouncer 54330, transaction pooling) 경유.
 * `?pgbouncer=true`로 prepared statement 가 비활성화되어 transaction 모드와 호환된다.
 * 마이그레이션은 DIRECT_URL(PG 54329 직결)을 쓴다(schema.prisma datasource.directUrl).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma 연결 성공 (PgBouncer 경유)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
