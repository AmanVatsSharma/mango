/**
 * Jest configuration (Next.js SWC transform).
 *
 * Note: We use `next/jest` so TypeScript test files and Next.js aliases work out-of-the-box.
 */

const nextJest = require("next/jest")

const createJestConfig = nextJest({
  dir: "./",
})

/** @type {import("jest").Config} */
const customJestConfig = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testMatch: ["**/tests/**/*.test.ts", "**/tests/**/*.test.tsx"],
  testPathIgnorePatterns: ["/tests/hooks/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@/auth$": "<rootDir>/tests/__mocks__/auth.js",
    "^next-auth$": "<rootDir>/tests/__mocks__/next-auth.js",
    "^next-auth/providers/credentials$": "<rootDir>/tests/__mocks__/credentials-provider.js",
    "^@auth/core$": "<rootDir>/tests/__mocks__/next-auth.js",
    "^@auth/prisma-adapter$": "<rootDir>/tests/__mocks__/next-auth.js",
    "^@auth/jose$": "<rootDir>/tests/__mocks__/next-auth.js",
    "^bcryptjs$": "<rootDir>/tests/__mocks__/bcryptjs.js",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(@auth|next-auth|next-auth-types)/)",
  ],
}

module.exports = createJestConfig(customJestConfig)

