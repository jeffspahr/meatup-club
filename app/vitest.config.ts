import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './test/setup.ts',
    include: ['**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['app/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '**/*.config.{ts,js}',
        '**/+types/**',
      ],
      thresholds: {
        statements: 58,
        branches: 47,
        functions: 40,
        lines: 59,
      },
    },
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './app'),
    },
  },
});
