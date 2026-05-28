/**
 * @file app/api/auth/mobile-token/route.ts
 * @module api/auth/mobile-token
 * @description
 *   Issues a NextAuth-compatible Bearer JWT to the React Native client. This is the
 *   mobile bridge between the existing OTP+mPin flow (which produces a `SessionAuth`
 *   row) and the rest of the API surface, which is gated by `requireAuthenticatedUserId()`
 *   → `auth()` → `getToken({ req })`. NextAuth's `getToken()` reads the
 *   `Authorization: Bearer <jwt>` header natively under JWT-strategy, so once this
 *   endpoint returns a valid JWT every protected `/api/trading/**` route becomes
 *   reachable from the RN app with zero changes to the existing guards.
 *
 *   Why a separate endpoint and not `mobile-signin`:
 *   `mobile-signin/route.ts` calls NextAuth's `signIn('credentials', …)` which sets a
 *   *cookie* in the response. Mobile clients can't carry NextAuth's `__Secure-`
 *   prefixed cookie reliably across an app cold-start, so we instead **return the raw
 *   encrypted JWT** in the response body. The RN client persists it in
 *   `expo-secure-store` and replays it as `Authorization: Bearer …`.
 *
 *   Round-trip verification (run after deploy):
 *     curl -X POST https://tradebazar.live/api/auth/mobile-token \
 *       -H 'content-type: application/json' \
 *       -d '{"sessionToken":"<a-valid-mpin-verified-sessionAuth.sessionToken>","deviceId":"smoke-1"}'
 *     # → { token: "<jwe>", expiresAt: "<iso>", user: { id, ... } }
 *     curl https://tradebazar.live/api/trading/account -H "authorization: Bearer <jwe>"
 *     # → 200 with the user's account, NOT 401.
 *
 * Exports:
 *   - POST(request: NextRequest) → NextResponse
 *
 * Depends on:
 *   - @/auth — for `authOptions.callbacks.jwt` reuse (avoids hand-rolling token shape;
 *     the jwt callback in auth.ts is ~150 lines and mints the sessionRegistryJti +
 *     refreshes DB-claims, so reusing it keeps mobile in lock-step with web)
 *   - @/lib/session-security/login-finalize — `finalizeCredentialLogin` mints the JTI
 *     and runs the same gate the web credentials provider does
 *   - next-auth/jwt — `encode()` produces the same JWE that `getToken()` will decrypt
 *   - @/lib/auth/account-access-policy — early gate on suspended/inactive users
 *
 * Side-effects:
 *   - Reads + updates `prisma.sessionAuth` (consumes the row)
 *   - May mint a `UserSessionRecord` row via `finalizeCredentialLogin` (registry JTI)
 *   - Logs auth events via `authLogger`
 *
 * Key invariants:
 *   - The salt passed to `encode()` MUST equal the salt the receiving `getToken()` uses,
 *     which defaults to the cookie name. Cookie name = `__Secure-authjs.session-token`
 *     when `useSecureCookies`, else `authjs.session-token`. NextAuth derives
 *     `useSecureCookies` from `process.env.AUTH_URL ?? NEXTAUTH_URL`'s protocol
 *     (`@auth/core/lib/init.js:73`). Mismatch → silent decryption failure → 401 on
 *     every authed request.
 *   - We pass `skipNetworkEval: true` to `finalizeCredentialLogin`. Reasoning: the
 *     mobile flow already proved device possession via OTP+mPin upstream; running the
 *     network-cluster eval here would otherwise force a STEP_UP we have no UI for.
 *   - `process.env.NEXTAUTH_SECRET` MUST match between this encoder and the web
 *     `auth.ts`. They share the same env in production, so this is implicit.
 *
 * Author:      StockTrade Mobile Team
 * Last-updated: 2026-04-30
 */

import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { authOptions } from '@/auth'
import { prisma } from '@/lib/prisma'
import { finalizeCredentialLogin } from '@/lib/session-security/login-finalize'
import { resolveAccountAccess } from '@/lib/auth/account-access-policy'
import { authLogger } from '@/lib/auth-logger'

const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60 // 30 days — must equal authOptions.session.maxAge

/**
 * Determine the salt the receiving `getToken()` will use.
 *
 * NextAuth's `init.js` derives `useSecureCookies` as:
 *   authOptions.useSecureCookies ?? url.protocol === 'https:'
 * where `url` is the resolved auth URL (AUTH_URL / NEXTAUTH_URL / request URL).
 * We replicate that here so the two sides agree on which salt to use.
 */
function resolveSessionCookieSalt(request: NextRequest): string {
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? request.url
  const useSecureCookies = (() => {
    try {
      return new URL(authUrl).protocol === 'https:'
    } catch {
      return request.url.startsWith('https://')
    }
  })()
  return useSecureCookies ? '__Secure-authjs.session-token' : 'authjs.session-token'
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { sessionToken?: unknown; deviceId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : ''
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : ''
  if (!sessionToken || !deviceId) {
    return NextResponse.json(
      { error: 'sessionToken and deviceId are required' },
      { status: 400 },
    )
  }

  const sessionAuth = await prisma.sessionAuth.findUnique({
    where: { sessionToken },
    include: { user: true },
  })

  if (!sessionAuth || sessionAuth.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
  }

  // OTP-only sessions cannot mint a token — mPin must be set + verified first.
  if (!sessionAuth.isMpinVerified) {
    return NextResponse.json(
      { error: 'mPin verification required', code: 'MPIN_REQUIRED' },
      { status: 403 },
    )
  }

  const accountGate = resolveAccountAccess({
    isActive: sessionAuth.user.isActive,
    suspendedAt: sessionAuth.user.suspendedAt,
  })
  if (accountGate.state !== 'ok') {
    return NextResponse.json(
      { error: accountGate.userMessage, code: 'ACCOUNT_BLOCKED' },
      { status: 403 },
    )
  }

  // Run the same finalize the web credentials provider runs, but skip the network
  // cluster step-up — OTP + mPin already proved possession on this device.
  const finalized = await finalizeCredentialLogin({
    user: sessionAuth.user,
    request,
    sessionAuth,
    action: 'login',
    skipNetworkEval: true,
  })

  if (!finalized) {
    await authLogger.logEvent({
      userId: sessionAuth.user.id,
      eventType: 'LOGIN_FAILED',
      severity: 'MEDIUM',
      message: 'mobile-token: finalizeCredentialLogin returned null',
      metadata: { deviceId },
    })
    return NextResponse.json({ error: 'Login finalization failed' }, { status: 401 })
  }

  // Defensive: if step-up bubbled up, the mobile client has no UI for it. Block here
  // rather than silently issue an unusable token. (Should not happen with skipNetworkEval.)
  if (finalized.sessionSecurityStepUpPending) {
    return NextResponse.json(
      { error: 'Step-up required', code: 'STEP_UP_REQUIRED' },
      { status: 403 },
    )
  }

  // Reuse the jwt() callback to build the exact token the web flow would emit.
  // This keeps mobile in lock-step with web — adding a new claim to the jwt
  // callback automatically lands on mobile too, with no edit here.
  // The callback expects `user` of the same shape `authorize()` returns.
  // Cast through unknown — `auth.ts` is `@ts-nocheck` so the callback signature
  // is loose; the runtime contract is what matters.
  const jwtCallback = (authOptions as { callbacks?: { jwt?: unknown } }).callbacks?.jwt as
    | ((args: {
        token: Record<string, unknown>
        user: unknown
        account: { provider: string; type: string } | null
        trigger: 'signIn'
      }) => Promise<Record<string, unknown>>)
    | undefined

  if (!jwtCallback) {
    return NextResponse.json(
      { error: 'Auth misconfigured: jwt callback missing' },
      { status: 500 },
    )
  }

  const token = await jwtCallback({
    token: {},
    user: finalized,
    account: { provider: 'credentials', type: 'credentials' },
    trigger: 'signIn',
  })

  // If the jwt callback flagged the session invalid (account blocked / JTI failed
  // post-mint), refuse — issuing a token whose first request would 401 is worse
  // than refusing here.
  if ((token as { invalidSession?: boolean }).invalidSession) {
    return NextResponse.json({ error: 'Session invalidated' }, { status: 401 })
  }

  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'Server misconfigured: NEXTAUTH_SECRET not set' },
      { status: 500 },
    )
  }

  const salt = resolveSessionCookieSalt(request)
  const encoded = await encode({
    token,
    secret,
    salt,
    maxAge: SESSION_MAX_AGE_SEC,
  })

  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000).toISOString()

  // Mirror the user shape the RN client expects (subset of the session.user the
  // web app would see after the session callback runs).
  const t = token as Record<string, unknown>
  const user = {
    id: t.id ?? sessionAuth.user.id,
    name: sessionAuth.user.name,
    email: sessionAuth.user.email,
    phone: t.phone ?? sessionAuth.user.phone ?? null,
    clientId: t.clientId ?? sessionAuth.user.clientId ?? null,
    role: t.role,
    image: t.picture ?? null,
    kycStatus: t.kycStatus ?? null,
    tradingAccountId: t.tradingAccountId ?? null,
    hasMpin: Boolean(t.hasMpin),
    phoneVerified: Boolean(t.phoneVerified),
  }

  await authLogger.logEvent({
    userId: sessionAuth.user.id,
    eventType: 'LOGIN_SUCCESS',
    severity: 'LOW',
    message: 'mobile-token issued',
    metadata: { deviceId, expiresAt },
  })

  return NextResponse.json({ token: encoded, expiresAt, user })
}
