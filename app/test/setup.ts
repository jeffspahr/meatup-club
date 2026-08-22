import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Import CSS for dark mode tests
import '../app/app.css';

// Return shared process state to a clean baseline after every test. Individual
// suites can still restore directly assigned globals (for example `fetch`) when
// they need to preserve the environment's original implementation.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
