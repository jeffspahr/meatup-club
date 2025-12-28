import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Import CSS for dark mode tests
import '../app/app.css';

// Cleanup after each test
afterEach(() => {
  cleanup();
});
