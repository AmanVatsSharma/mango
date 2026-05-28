/**
 * Jest configuration for client-side hook tests.
 * Uses jsdom so @testing-library/react and localStorage are available.
 * All other tests use the node environment via jest.config.cjs.
 */

const nextJest = require("next/jest")

const createJestConfig = nextJest({
  dir: "./",
})

/** @type {import("jest").Config} */
const customJestConfig = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/tests/setup-hooks.ts"],
  testMatch: ["**/tests/hooks/**/*.test.ts", "**/tests/hooks/**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@/auth$": "<rootDir>/tests/__mocks__/auth.js",
    "^next-auth$": "<rootDir>/tests/__mocks__/next-auth.js",
    "^next-auth/providers/credentials$": "<rootDir>/tests/__mocks__/credentials-provider.js",
    "^@auth/core$": "<rootDir>/tests/__mocks__/next-auth.js",
    "^@auth/prisma-adapter$": "<rootDir>/tests/__mocks__/next-auth.js",
    "^bcryptjs$": "<rootDir>/tests/__mocks__/bcryptjs.js",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(@auth|next-auth|next-auth-types)/)",
  ],
}

module.exports = createJestConfig(customJestConfig)