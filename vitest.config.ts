import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@batdi/types': `${root}packages/types/src/index.ts`,
      '@batdi/a2ui-schema': `${root}packages/a2ui-schema/src/index.ts`,
      '@batdi/ui': `${root}packages/ui/src/index.ts`,
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/**/test/**/*.test.ts', 'packages/**/test/**/*.test.ts'],
  },
});
