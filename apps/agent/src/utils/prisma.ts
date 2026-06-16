/**
 * Prisma 싱글톤 (P2-W4 4.5 — L0 Envelope 캐시 DB 접근)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §4.2 (L0 Envelope 캐시),
 *       Ref-docs/specs/interface/batdi-db-schema.md D그룹 cache_ui_envelopes
 *
 * 책임:
 *  - 프로세스 단일 PrismaClient 를 lazy 초기화해 반환한다(getPrisma).
 *  - L0 캐시는 **best-effort**: DATABASE_URL 미설정·연결 실패는 캐시만 비활성화하고
 *    그래프 실행을 막지 않는다(graceful degradation). 따라서 여기서 throw 하지 않고
 *    undefined 를 반환하면 호출부(cache-lookup/emit-a2ui)가 캐시를 건너뛴다.
 *
 * agent 는 루트 .env(langgraph.json `env:"../../.env"`)로 DATABASE_URL(PgBouncer 54330)
 * 을 로드한다. @prisma/client 는 api 가 generate 한 client 를 workspace 공유로 resolve.
 */
import { PrismaClient } from '@prisma/client';

let client: PrismaClient | null = null;
let resolved = false;

/**
 * 프로세스 단일 PrismaClient 를 반환한다(lazy). DATABASE_URL 미설정이거나 client 생성
 * 자체가 실패하면 undefined 를 반환한다(캐시 best-effort — 호출부가 안전하게 skip).
 *
 * ⚠️ 실제 DB 연결은 첫 쿼리 시점에 lazy 로 맺어진다. 연결 실패는 쿼리 try/catch 에서
 *    잡아 MISS 로 graceful 처리한다(여기서는 client 인스턴스 생성만 책임).
 */
export function getPrisma(): PrismaClient | undefined {
  if (resolved) {
    return client ?? undefined;
  }
  resolved = true;

  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    // DATABASE_URL 없음 → 캐시 비활성(no-op). 그래프 실행에는 영향 없음.
    return undefined;
  }

  try {
    client = new PrismaClient();
  } catch {
    // client 생성 실패(잘못된 schema/엔진 등) → 캐시 비활성, 그래프는 정상 진행.
    client = null;
  }
  return client ?? undefined;
}

/**
 * 테스트 격리용 리셋(싱글톤 캐시 무효화). 런타임에서는 호출하지 않는다.
 */
export function __resetPrismaForTest(): void {
  client = null;
  resolved = false;
}
