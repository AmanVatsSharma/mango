/**
 * @file app/api/mobile/login/route.ts
 * @module api/mobile/login
 * @description
 *   ⚠️ CONSOLIDATION DEBT: this route mirrors the business logic of the
 *   `mobileLogin` Server Action (actions/mobile-auth.actions.ts:69). Behavior changes
 *   MUST be applied to BOTH files until they're factored behind a shared core helper.
 *   Tracked: Trading-wpv.
 *
 *   Public REST endpoint that bootstraps the React Native auth flow with phone/clientId
 *   + password. This is the missing link between the existing Server Action `mobileLogin`
 *   (actions/mobile-auth.actions.ts) — used by the web mobile-responsive flow — and the
 *   new RN client. Server Actions can't be invoked cleanly from a non-browser HTTP
 *   client, and Next.js's action transformer wraps them in a way that's fragile across
 *   versions, so the RN app needs a plain REST entrypoint.
 *
 *   Contract (mirrors `mobileLogin`'s response shape so RN can drive its own routing):
 *     POST { identifier: string, password: string }
 *     200 → { sessionToken, requiresOtp?, requiresMpin?, requiresKyc?, kycStatus?, userData? }
 *     400/401/403 → { error, code? }
 *
 *   Flow on the RN side:
 *     1. User enters phone+password → POST /api/mobile/login
 *     2. requiresOtp: true → RN navigates to OTP screen → POST /api/otp/verify
 *     3. requiresMpin: true → RN navigates to mPin screen → POST /api/mpin/verify
 *     4. After mPin verified → POST /api/auth/mobile-token to get the Bearer JWT
 *     5. requiresKyc: true → RN opens web app via expo-web-browser at the KYC URL
 *
 *   This endpoint mirrors the business logic of `mobileLogin` for now. The two
 *   should be consolidated behind a shared core helper — tracked as Trading-wpv.
 *   Until then, behavior changes MUST be applied to BOTH this file and `mobileLogin`
 *   to keep web and mobile flows in sync.
 *
 * Exports:
 *   - POST(request: NextRequest) → NextResponse
 *
 * Depends on:
 *   - @/data/user           — getUserByIdentifier (phone or clientId lookup)
 *   - @/lib/otp-service     — OtpService.generateAndSendOtp
 *   - @/lib/mpin-service    — MpinService.{hasMpin, createSessionAuth}
 *   - @/lib/auth/account-access-policy — suspended/deactivated gate
 *   - @/lib/auth/kyc-gating — deriveKycState, requiresKycRedirect, getKycRedirectMessage
 *   - @/lib/server/kyc-enforcement — getKycEnforcementFromDB
 *   - @/lib/auth-logger     — login event logging
 *   - bcryptjs              — password compare
 *   - @/schemas             — mobileSignInSchema (Zod)
 *
 * Side-effects:
 *   - bcrypt compare against User.password
 *   - May send an SMS OTP (twilio/aws-sns) via OtpService
 *   - May create a SessionAuth row via MpinService
 *   - Writes auth log events
 *
 * Key invariants:
 *   - This endpoint NEVER sets a NextAuth session cookie. Mobile clients use the
 *     Bearer JWT flow (POST /api/auth/mobile-token) once OTP+mPin complete; the
 *     cookie path is web-only. Setting a cookie here would be a no-op on RN (it
 *     can't replay it across cold-starts) and a security smell on web (it would
 *     log the user in *before* OTP+mPin).
 *   - The Zod schema validates `identifier` is digits-only (phone) or a clientId
 *     pattern. Generic email-style identifiers are rejected at validation.
 *   - `requireOtpOnLogin` user preference is honored; if disabled, OTP step is
 *     skipped and `requiresMpin: true` is returned directly.
 *
 * Author:      StockTrade Mobile Team
 * Last-updated: 2026-04-30
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { mobileSignInSchema } from '@/schemas'
import { getUserByIdentifier } from '@/data/user'
import { OtpService } from '@/lib/otp-service'
import { MpinService } from '@/lib/mpin-service'
import { resolveAccountAccess } from '@/lib/auth/account-access-policy'
import {
  deriveKycState,
  getKycRedirectMessage,
  requiresKycRedirect,
} from '@/lib/auth/kyc-gating'
import { getKycEnforcementFromDB } from '@/lib/server/kyc-enforcement'
import { authLogger, extractClientInfo } from '@/lib/auth-logger'
import { prisma } from '@/lib/prisma'
import { getAuthRoute } from '@/lib/branding-routes'

interface MobileLoginUserData {
  userId?: string
  phone?: string | null
  emailEnqueued?: boolean
  emailAttempted?: boolean
  emailError?: string
  purpose?: string
}

interface MobileLoginResponse {
  sessionToken?: string
  requiresOtp?: boolean
  requiresMpin?: boolean
  requiresKyc?: boolean
  kycStatus?: string
  redirectTo?: string
  message?: string
  userData?: MobileLoginUserData
}

const AUTH_KYC_ROUTE = getAuthRoute('kyc')

async function logSafely(fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    // Never let audit-log failure break the login flow.
    console.error('[mobile-login] auth log failed:', err)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validated = mobileSignInSchema.safeParse(body)
  if (!validated.success) {
    const errors = validated.error.issues.map((e) => e.message).join(', ')
    return NextResponse.json(
      { error: `Invalid input: ${errors}. Use your Mobile or Client ID and password.` },
      { status: 400 },
    )
  }

  const { identifier, password } = validated.data
  const clientInfo = extractClientInfo(request)

  const user = await getUserByIdentifier(identifier)

  await logSafely(() =>
    authLogger.logLogin('LOGIN_ATTEMPT', user?.id ?? 'unknown', identifier, clientInfo),
  )

  if (!user || !user.password) {
    await logSafely(() =>
      authLogger.logSecurityEvent('LOGIN_FAILED', 'Invalid mobile number or Client ID', {
        identifier,
        errorCode: 'USER_NOT_FOUND',
      }),
    )
    return NextResponse.json(
      {
        error:
          'Invalid credentials. Check Mobile/Client ID and password. If you just registered, verify OTP and set mPin first.',
      },
      { status: 401 },
    )
  }

  const passwordsMatch = await bcrypt.compare(password, user.password)
  if (!passwordsMatch) {
    await logSafely(() =>
      authLogger.logSecurityEvent('LOGIN_FAILED', 'Invalid password provided', {
        userId: user.id,
        identifier,
        errorCode: 'INVALID_PASSWORD',
      }),
    )
    return NextResponse.json(
      { error: 'Incorrect password. If forgotten, use Forgot password to reset via email/OTP.' },
      { status: 401 },
    )
  }

  const accessGate = resolveAccountAccess({
    isActive: user.isActive,
    suspendedAt: user.suspendedAt,
  })
  if (accessGate.state !== 'ok') {
    return NextResponse.json(
      { error: accessGate.userMessage, code: accessGate.state.toUpperCase() },
      { status: 403 },
    )
  }

  // --- Branch 1: phone not yet verified → send PHONE_VERIFICATION OTP. ---
  if (!user.phoneVerified && user.phone) {
    const otpResult = await OtpService.generateAndSendOtp(
      user.id,
      user.phone,
      'PHONE_VERIFICATION',
    )

    if (!otpResult.success) {
      return NextResponse.json(
        { error: otpResult.message || 'Failed to send OTP. Please try again.' },
        { status: 500 },
      )
    }

    const sessionToken = await MpinService.createSessionAuth(user.id)
    await logSafely(() =>
      authLogger.logLogin('LOGIN_SUCCESS', user.id, identifier, clientInfo),
    )

    const response: MobileLoginResponse = {
      sessionToken,
      requiresOtp: true,
      message: otpResult.data?.development
        ? 'OTP generated. Check server console for the OTP code.'
        : `Please verify the OTP sent to your mobile${otpResult.data?.emailEnqueued ? ' and email' : ''}`,
      userData: {
        userId: user.id,
        phone: user.phone,
        emailAttempted: otpResult.data?.emailAttempted,
        emailEnqueued: otpResult.data?.emailEnqueued,
        emailError: otpResult.data?.emailError,
        purpose: 'PHONE_VERIFICATION',
      },
    }
    return NextResponse.json(response)
  }

  // --- Branch 2: no mPin set → send MPIN_SETUP OTP, then mPin setup. ---
  const hasMpin = await MpinService.hasMpin(user.id)
  if (!hasMpin) {
    const otpResult = await OtpService.generateAndSendOtp(user.id, user.phone!, 'MPIN_SETUP')

    if (!otpResult.success) {
      return NextResponse.json(
        {
          error:
            otpResult.message || 'Failed to send OTP for mPin setup. Please try again.',
        },
        { status: 500 },
      )
    }

    const sessionToken = await MpinService.createSessionAuth(user.id)
    await logSafely(() =>
      authLogger.logLogin('LOGIN_SUCCESS', user.id, identifier, clientInfo),
    )

    const response: MobileLoginResponse = {
      sessionToken,
      requiresOtp: true,
      message: `Please set up your mPin. OTP sent to your mobile${otpResult.data?.emailEnqueued ? ' and email' : ''}.`,
      userData: {
        userId: user.id,
        phone: user.phone,
        emailAttempted: otpResult.data?.emailAttempted,
        emailEnqueued: otpResult.data?.emailEnqueued,
        emailError: otpResult.data?.emailError,
        purpose: 'MPIN_SETUP',
      },
    }
    return NextResponse.json(response)
  }

  // --- Branch 3: KYC required → return redirect; RN opens web in in-app browser. ---
  const userWithKyc = await prisma.user.findUnique({
    where: { id: user.id },
    include: { kyc: true },
  })
  const kycEnforcementEnabled = await getKycEnforcementFromDB()
  const kycState = deriveKycState(userWithKyc?.kyc)

  if (kycEnforcementEnabled && requiresKycRedirect(kycState)) {
    await logSafely(() =>
      authLogger.logLogin('LOGIN_SUCCESS', user.id, identifier, clientInfo),
    )
    const response: MobileLoginResponse = {
      requiresKyc: true,
      kycStatus: kycState,
      redirectTo: AUTH_KYC_ROUTE,
      message: getKycRedirectMessage(kycState),
    }
    return NextResponse.json(response)
  }

  // --- Branch 4: standard login. Honor user's OTP-on-login preference. ---
  const userRequiresOtp = user.requireOtpOnLogin ?? true

  if (!userRequiresOtp) {
    const sessionToken = await MpinService.createSessionAuth(user.id)
    await logSafely(() =>
      authLogger.logLogin('LOGIN_SUCCESS', user.id, identifier, clientInfo),
    )
    const response: MobileLoginResponse = {
      sessionToken,
      requiresMpin: true,
      message: 'Please enter your mPin to complete login.',
    }
    return NextResponse.json(response)
  }

  const otpResult = await OtpService.generateAndSendOtp(
    user.id,
    user.phone!,
    'LOGIN_VERIFICATION',
  )

  if (!otpResult.success) {
    return NextResponse.json(
      {
        error:
          otpResult.message ||
          'Failed to send OTP. Please tap Resend OTP or try again later.',
      },
      { status: 500 },
    )
  }

  const sessionToken = await MpinService.createSessionAuth(user.id)
  await logSafely(() =>
    authLogger.logLogin('LOGIN_SUCCESS', user.id, identifier, clientInfo),
  )

  const response: MobileLoginResponse = {
    sessionToken,
    requiresOtp: true,
    message: `OTP sent to your mobile${otpResult.data?.emailEnqueued ? ' and email' : ''}. Enter the 6-digit code to continue`,
    userData: {
      userId: user.id,
      phone: user.phone,
      emailAttempted: otpResult.data?.emailAttempted,
      emailEnqueued: otpResult.data?.emailEnqueued,
      emailError: otpResult.data?.emailError,
      purpose: 'LOGIN_VERIFICATION',
    },
  }
  return NextResponse.json(response)
}
