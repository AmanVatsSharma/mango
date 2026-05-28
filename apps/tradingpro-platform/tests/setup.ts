// tests/setup.ts
import { PrismaClient } from '@prisma/client';

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.NEXTAUTH_SECRET = 'test-secret-key';
  process.env.NEXTAUTH_URL = 'http://localhost:3000';

  // Mock AWS credentials for testing
  process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.AWS_REGION = 'ap-south-1';
});

afterAll(async () => {
  // Cleanup after all tests
  console.log('🧹 Cleaning up test environment...');
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Suppress console output during tests unless explicitly enabled
  if (!process.env.VERBOSE_TESTS) {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  }
});

afterEach(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test timeout
jest.setTimeout;

// Mock NextAuth
jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: jest.fn(() => ({
    data: null,
    status: 'unauthenticated'
  }))
}));

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn()
  })),
  useSearchParams: jest.fn(() => ({
    get: jest.fn()
  }))
}));

// Mock React — real React for @testing-library/react; stubs for non-hook tests.
// In jsdom (jest.config.hooks.cjs): @testing-library/react calls
// jest.requireActual("react") BEFORE this mock is processed, so it gets
// real React.useState/useEffect. This is critical for localStorage access.
// In node (jest.config.cjs): the jest.fn() stubs are harmless since API tests
// don't call React hooks directly.
jest.mock('react', () => {
  const real = jest.requireActual('react')
  return {
    ...real,
    useTransition: jest.fn(() => [false, jest.fn()]),
    useState: jest.fn((initial: unknown) => {
      const setState = jest.fn((v: unknown) => { void v })
      return [initial, setState]
    }),
    useEffect: jest.fn(),
    useCallback: jest.fn((fn: Function) => fn),
    useMemo: jest.fn((fn: () => unknown) => fn()),
  }
});