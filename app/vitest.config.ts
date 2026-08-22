import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './test/setup.ts',
    include: ['app/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['app/**/*.{ts,tsx}'],
      thresholds: {
        lines: 75,
        functions: 60,
        branches: 65,
        statements: 75,
        '**/lib/auth.server.ts': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
        '**/lib/rsvps.server.ts': {
          lines: 95,
          functions: 90,
          branches: 60,
          statements: 95,
        },
        '**/routes/api.webhooks.*.tsx': {
          lines: 85,
          functions: 90,
          branches: 70,
          statements: 85,
        },
        '**/routes/dashboard.admin.events.tsx': {
          lines: 70,
          functions: 55,
          branches: 58,
          statements: 70,
        },
        '**/routes/dashboard.admin.members.tsx': {
          lines: 85,
          functions: 80,
          branches: 70,
          statements: 85,
        },
        '**/routes/dashboard.admin.polls.tsx': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
        '**/routes/dashboard.admin.setup.tsx': {
          lines: 95,
          functions: 90,
          branches: 80,
          statements: 95,
        },
      },
      exclude: [
        'node_modules/',
        'test/',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '**/*.config.{ts,js}',
        '**/+types/**',
        'build/',
      ],
    },
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './app'),
    },
  },
});
