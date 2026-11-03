import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Database integration tests share TEST_DATABASE_URL.
    // Run test files sequentially to prevent cross-test
    // deletion and other database race conditions.
    fileParallelism: false,
  },
});
