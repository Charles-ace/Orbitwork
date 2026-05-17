import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['__tests__/setup.js'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
