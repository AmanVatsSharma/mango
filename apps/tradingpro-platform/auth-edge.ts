/**
 * @file auth-edge.ts
 * @module auth
 * @description Edge-safe NextAuth wrapper for middleware JWT decode; mirrors Node session invalidation when `invalidSession` is set on the token.
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-28
 *
 * Notes:
 * - Keeps middleware aligned with `auth.ts` so stripped sessions are not treated as logged-in on the Edge runtime.
 * - `session.user.id` uses JWT `id` or falls back to Auth.js `sub`.
 * - Registry id is `sessionRegistryJti` (not JWT claim `jti`, which Auth.js rotates on each encode).
 */

import NextAuth from "next-auth"
import { authSessionDebugEdge, prefixId } from "@/lib/auth-session-debug"

export const { auth: authEdge } = NextAuth({
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async session({ session, token }) {
      if (token && (token as { invalidSession?: boolean }).invalidSession) {
        session.user = undefined as unknown as typeof session.user
        authSessionDebugEdge("edge:session", { stripUser: true })
        return session
      }
      if (token) {
        const anyTok = token as Record<string, unknown>
        const resolvedId =
          (typeof anyTok.id === "string" && anyTok.id.trim() !== ""
            ? anyTok.id
            : typeof anyTok.sub === "string"
              ? anyTok.sub
              : undefined) as string | undefined
        session.user = (session.user ?? {}) as unknown as typeof session.user
        ;(session.user as unknown as Record<string, unknown>).id = resolvedId
        ;(session.user as unknown as Record<string, unknown>).name = token.name as string | undefined
        ;(session.user as unknown as Record<string, unknown>).email = token.email as string | undefined

        const anySessionUser = session.user as unknown as Record<string, unknown>
        const anyToken = token as Record<string, unknown>
        anySessionUser.kycStatus = anyToken.kycStatus
        anySessionUser.tradingAccountId = anyToken.tradingAccountId
        anySessionUser.phone = anyToken.phone
        anySessionUser.clientId = anyToken.clientId
        anySessionUser.hasMpin = anyToken.hasMpin
        anySessionUser.phoneVerified = anyToken.phoneVerified
        anySessionUser.role = anyToken.role
        anySessionUser.sessionSecurityStepUpPending = Boolean(anyToken.sessionSecurityStepUpPending)
        if (process.env.MIDDLEWARE_DEBUG === "1") {
          authSessionDebugEdge("edge:session:claims", {
            uidPrefix: prefixId(resolvedId),
            role: anySessionUser.role,
            kycStatus: anySessionUser.kycStatus,
            stepUpPending: anySessionUser.sessionSecurityStepUpPending,
            tokenKeys: Object.keys(anyToken),
          })
        }
        anySessionUser.sessionSecurityStepUpChallengeId = anyToken.sessionSecurityStepUpChallengeId as
          | string
          | undefined
        const regJti = anyToken.sessionRegistryJti as string | undefined
        if (regJti) {
          anySessionUser.sessionRegistryJti = regJti
          anySessionUser.jti = regJti
        }
        authSessionDebugEdge("edge:session", {
          stripUser: false,
          uidPrefix: prefixId(resolvedId),
          jtiPrefix: prefixId(regJti),
        })
      }
      return session
    },
    async jwt({ token }) {
      return token
    },
  },
})
