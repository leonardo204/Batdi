/**
 * 일회성 크롤 적재 스크립트 (로컬 테스트용)
 *   - team_head_to_head + game_lineups 를 KBO 공식에서 1회 크롤해 적재한다.
 *   - 실행: set -a; source .env; set +a; pnpm --filter @batdi/api exec tsx scripts/crawl-populate.ts
 */
// ⚠️ tsx(esbuild)는 emitDecoratorMetadata 를 안 내보내 Nest DI 가 동작하지 않는다.
//   → Nest 컨텍스트 대신 PrismaClient 를 직접 주입해 writer/scraper 를 인스턴스화한다.
import { PrismaClient } from '@prisma/client';
import { KboScraper } from '../src/kbo/kbo-scraper';
import { H2HWriter, LineupWriter } from '../src/kbo/kbo-writer';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const scraper = new KboScraper();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h2hWriter = new H2HWriter(prisma as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineupWriter = new LineupWriter(prisma as any);
  const season = new Date().getFullYear();

  console.log('[crawl] scrapeHeadToHead season=%d ...', season);
  const h2h = await scraper.scrapeHeadToHead(season);
  const h2hRes = await h2hWriter.write(h2h);
  console.log('[crawl] h2h parsed=%d write=%j', h2h.length, h2hRes);

  console.log('[crawl] scrapeLineups ...');
  const lineups = await scraper.scrapeLineups();
  const luRes = await lineupWriter.write(lineups);
  console.log('[crawl] lineups parsed=%d write=%j', lineups.length, luRes);

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[crawl] FAILED', e);
    process.exit(1);
  });
