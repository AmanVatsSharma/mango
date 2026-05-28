/**
 * @file policy-constants.ts
 * @module lib/services/risk
 * @description Client-safe constants for trading policy limits.
 *   Keep this file free of server-only imports (Prisma, Redis, etc.)
 *   so it can be imported by both client and server components.
 */

/** Maximum number of conditions allowed per custom trading policy. */
export const MAX_POLICY_CONDITIONS = 12
