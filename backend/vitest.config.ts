import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    // Database integration tests share TEST_DATABASE_URL.
    // Run test files sequentially to prevent cross-test
    // deletion and other database race conditions.
    fileParallelism: false,
  },
});
