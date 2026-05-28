// tests/__mocks__/auth.js
// Mock for @/auth (imported as `import { signIn } from "@/auth"`)
// Must intercept all auth.ts exports used by auth.actions.ts
module.exports = {
  signIn: jest.fn().mockResolvedValue({ ok: true }),
  signOut: jest.fn().mockResolvedValue(undefined),
  auth: jest.fn().mockResolvedValue({ user: { id: "test-admin-id", role: "ADMIN" } }),
  default: jest.fn(),
  AuthOptions: jest.fn(),
}