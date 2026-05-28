/**
 * File:        tests/setup-hooks.ts
 * Module:      test-setup
 * Purpose:     Jest setup for client-side hook tests (jsdom environment).
 *              Does NOT mock React, allowing @testing-library/react to use real hooks.
 *
 * Depends on:
 *   - react (real — not mocked)
 *   - next-auth/react (mocked)
 *   - next/navigation (mocked)
 *
 * Side-effects: mocks NextAuth and router; leaves React unmocked
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-15
 */

import { PrismaClient } from '@prisma/client';

// Global test setup
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.NEXTAUTH_SECRET = 'test-secret-key';
  process.env.NEXTAUTH_URL = 'http://localhost:3000';
  process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.AWS_REGION = 'ap-south-1';
});

afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  if (!process.env.VERBOSE_TESTS) {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  }
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

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
}))