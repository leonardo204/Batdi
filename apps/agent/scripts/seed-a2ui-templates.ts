/**
 * a2ui_templates 시드 스크립트 (P3-W8 8.4, ADR-047)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-047, §4.3 (a2ui_templates 스키마)
 *
 * 책임:
 *  - in-memory `templates/registry.ts` 의 `TEMPLATE_CATALOG`(런타임 SSOT)를 단일 출처로,
 *    DB `a2ui_templates` 테이블을 **파생 시드**한다(catalog-of-record, 드리프트 0).
 *  - component_tree 는 §4.3 대로 **authoring 트리 그대로**(`{{bind:"..."}}` 플레이스홀더 포함).
 *  - upsert(by template_id) 라 재실행 안전(idempotent). 런타임은 DB 를 읽지 않는다(L1 latency 우선).
 *
 * ⚠️ agent → @prisma/client 직접 의존(utils/prisma.ts 와 동일). apps/api 역의존 금지 — registry 는
 *    상대경로 import. seed-memes.ts upsert 패턴을 따르되, agent 는 ESM("type":"module")이라
 *    엔트리 가드는 `import.meta.url` 비교를 쓴다(require.main 미사용).
 *
 * 실행(tsx):
 *   DATABASE_URL="postgresql://batdi:batdi@localhost:54330/batdi?pgbouncer=true" \
 *     pnpm --filter @batdi/agent exec tsx scripts/seed-a2ui-templates.ts
 */
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { TEMPLATE_CATALOG } from '../src/templates/registry';

/**
 * TEMPLATE_CATALOG → a2ui_templates upsert(by template_id, idempotent).
 *
 *  - 각 row 를 template_id 기준 upsert: 있으면 update, 없으면 create.
 *  - componentTree/bindSchema/variants 는 JSON(B) 컬럼에 그대로 직렬화.
 *
 * @param prisma PrismaClient (엔트리 또는 다른 시드 스크립트가 주입)
 * @returns upsert 한 건수(=카탈로그 길이)
 */
export async function seedA2uiTemplates(prisma: PrismaClient): Promise<number> {
  let count = 0;
  for (const row of TEMPLATE_CATALOG) {
    const data = {
      intent: row.intent,
      componentTree: row.componentTree as unknown as object,
      bindSchema: row.bindSchema as unknown as object,
      variants: (row.variants ?? null) as unknown as object | null,
    };
    await prisma.a2uiTemplate.upsert({
      where: { templateId: row.templateId },
      create: { templateId: row.templateId, ...data },
      update: data,
    });
    count += 1;
  }
  // eslint-disable-next-line no-console
  console.log(`[seed-a2ui-templates] ${count}건 upsert 완료(idempotent)`);
  return count;
}

/**
 * tsx 직접 실행 엔트리(`require.main === module`).
 * DATABASE_URL 환경변수로 PostgreSQL 에 연결해 시드 후 disconnect.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedA2uiTemplates(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// ESM 엔트리 가드(agent 는 "type":"module") — import 로 쓰일 땐 실행 안 함, 직접 실행 시에만 main().
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed-a2ui-templates] 실패:', err);
    process.exitCode = 1;
  });
}
