import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@batdi/types': `${root}packages/types/src/index.ts`,
      '@batdi/guardrail': `${root}packages/guardrail/src/index.ts`,
      '@batdi/a2ui-schema': `${root}packages/a2ui-schema/src/index.ts`,
      '@batdi/ui': `${root}packages/ui/src/index.ts`,
    },
  },
  test: {
    globals: false,
    environment: 'node',
    // 테스트 격리: Vitest 가 루트 .env 를 process.env 에 병합하면 로컬 PgBouncer/Postgres
    // 가 실제로 떠 있어 L0 캐시(getPrisma)가 진짜 DB 를 조회/기록 → 비결정적이 된다
    // (이전 실행의 write 가 다음 실행에서 HIT). DATABASE_URL 을 빈 문자열로 덮어써
    // 캐시를 비활성(getPrisma → undefined)한다. L0 동작 검증은 getPrisma 를 직접
    // 모킹하는 cache-lookup.test.ts / cache-l0-e2e.test.ts 가 담당한다.
    env: { DATABASE_URL: '' },
    include: ['apps/**/test/**/*.test.ts', 'packages/**/test/**/*.test.ts'],
  },
});
