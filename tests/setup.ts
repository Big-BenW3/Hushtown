import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Component tests need explicit cleanup because vitest globals are off.
afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});
