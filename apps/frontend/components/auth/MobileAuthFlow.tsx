/**
 * @file MobileAuthFlow.tsx
 * @module components/auth
 * @description Multi-step mobile-first auth orchestrator with desktop-enhanced shell presentation.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-28
 */

"use client"
import React, { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { messageForCredentialsSigninCode } from "@/lib/auth/account-access-policy"
import { signIn as clientSignIn, signOut as clientSignOut } from "next-auth/react"
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import MobileLoginForm from './MobileLoginForm'
import OtpVerificationForm from './OtpVerificationForm'
import MpinForm from './MpinForm'
import MobileRegistrationForm from './MobileRegistrationForm'
import { fetchSessionSnapshot, hasHydratedSessionUser, pollForHydratedSession } from "./session-bootstrap-utils"
import { BRAND_IDENTITY, BRAND_ASSETS } from "@/Branding"
import { getAppRoute, getAuthRoute } from "@/lib/branding-routes"

type AuthStep = 'login' | 'register' | 'otp' | 'mpin-setup' | 'mpin-verify'

interface AuthData {
  sessionToken?: string;
  userData?: any;
  requiresOtp?: boolean;
  requiresMpin?: boolean;
  redirectTo?: string;
}

interface MobileAuthFlowProps {
  initialStep?: AuthStep;
}

const SESSION_FINALIZATION_MAX_MS = 22000
const SESSION_GUARD_ENDPOINT = "/api/ready/session"

const MobileAuthFlow: React.FC<MobileAuthFlowProps> = ({ initialStep = 'login' }) => {
  const [currentStep, setCurrentStep] = useState<AuthStep>(initialStep)
  const [authData, setAuthData] = useState<AuthData>({})
  const [isFinalizingLogin, setIsFinalizingLogin] = useState(false)
  const [finalizationError, setFinalizationError] = useState<string | undefined>("")
  const [loginUrlError, setLoginUrlError] = useState<string | undefined>("")
  const [pendingRedirectPath, setPendingRedirectPath] = useState<string | undefined>(undefined)
  const router = useRouter()
  const searchParams = useSearchParams()

  React.useEffect(() => {
    const err = searchParams?.get("error")
    const code = searchParams?.get("code")
    if (err === "CredentialsSignin" && code) {
      const msg = messageForCredentialsSigninCode(code)
      if (msg) setLoginUrlError(msg)
    }
  }, [searchParams])

  // Strip invalid-session cookies: `/api/auth/session` can return only `expires` when JWT is marked invalid (no `user`).
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const snap = await fetchSessionSnapshot()
      if (cancelled) return
      const p = snap.payload as { expires?: unknown; user?: unknown } | null | undefined
      if (
        p &&
        typeof (p as { expires?: string }).expires === "string" &&
        !hasHydratedSessionUser(p)
      ) {
        await clientSignOut({ redirect: false })
        router.refresh()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  const persistSessionToken = useCallback((token?: string) => {
    try {
      if (typeof window === 'undefined') return;
      if (token) {
        sessionStorage.setItem('authSessionToken', token);
      }
    } catch {}
  }, [])

  const readPersistedSessionToken = useCallback((): string | undefined => {
    try {
      if (typeof window === 'undefined') return undefined;
      return sessionStorage.getItem('authSessionToken') || undefined;
    } catch {
      return undefined;
    }
  }, [])

  const clearPersistedSessionToken = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      sessionStorage.removeItem('authSessionToken');
    } catch {}
  }, [])

  const logSessionBootstrapFailure = useCallback((error: unknown, attempt: number) => {
    if (process.env.NODE_ENV === "production") return
    const message = error instanceof Error ? error.message : String(error)
    console.warn("[MobileAuthFlow] Session bootstrap attempt failed", { attempt, message })
  }, [])

  const waitForSessionBootstrap = useCallback(async (attempts = 8, delayMs = 350) => {
    return pollForHydratedSession({
      attempts,
      delayMs,
      requestTimeoutMs: 2500,
      onAttemptFailure: logSessionBootstrapFailure,
    })
  }, [logSessionBootstrapFailure])

  const waitForMiddlewareSessionReadiness = useCallback(async (attempts = 6, delayMs = 350) => {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(SESSION_GUARD_ENDPOINT, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        })

        if (response.ok) return { ready: true as const }
        if (response.status === 403) {
          const payload = (await response.json().catch(() => null)) as { code?: string } | null
          if (payload?.code === "SESSION_SECURITY_STEP_UP") {
            return { ready: false as const, requiresStepUp: true as const }
          }
        }
      } catch (error) {
        logSessionBootstrapFailure(error, attempt)
      }

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }

    return { ready: false as const }
  }, [logSessionBootstrapFailure])

  const finalizeSessionWithToken = useCallback(async (): Promise<boolean> => {
    const token = authData.sessionToken || readPersistedSessionToken()
    if (!token) return false

    try {
      const result = await clientSignIn("credentials", {
        sessionToken: token,
        redirect: false,
      })

      return !result?.error
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        const message = error instanceof Error ? error.message : String(error)
        console.warn("[MobileAuthFlow] client signIn retry failed", { message })
      }
      return false
    }
  }, [authData.sessionToken, readPersistedSessionToken])

  const finalizeLoginAndNavigate = useCallback(async (targetPath: string) => {
    setPendingRedirectPath(targetPath)
    setIsFinalizingLogin(true)
    setFinalizationError("")

    const deadlineAt = Date.now() + SESSION_FINALIZATION_MAX_MS
    const hasTimedOut = () => Date.now() > deadlineAt
    // Re-run client sign-in first: server-action `signIn` may not attach the session cookie before the first `/api/auth/session` poll in some environments.
    if (!hasTimedOut()) {
      await finalizeSessionWithToken()
    }
    let sessionReady = await waitForSessionBootstrap(12, 400)
    if (!sessionReady && !hasTimedOut()) {
      await finalizeSessionWithToken()
      sessionReady = await waitForSessionBootstrap(14, 350)
    }

    if (!sessionReady && !hasTimedOut()) {
      router.refresh()
      sessionReady = await waitForSessionBootstrap(8, 500)
    }

    if (!sessionReady) {
      clearPersistedSessionToken()
      setFinalizationError(
        "We could not confirm your session after sign-in. Stay on this page and tap Retry, or sign in again — opening the dashboard without a session will send you back to login."
      )
      setIsFinalizingLogin(false)
      return
    }

    const middlewareGate = await waitForMiddlewareSessionReadiness(8, 400)
    if ("requiresStepUp" in middlewareGate && middlewareGate.requiresStepUp) {
      clearPersistedSessionToken()
      const stepUpRoute = getAuthRoute("sessionSecurityStepUp")
      router.push(stepUpRoute)
      router.refresh()
      setIsFinalizingLogin(false)
      return
    }
    if (!middlewareGate.ready) {
      clearPersistedSessionToken()
      setFinalizationError(
        "Your login was verified, but secure session activation is still syncing. Please tap Retry once."
      )
      setIsFinalizingLogin(false)
      return
    }

    clearPersistedSessionToken()
    router.push(targetPath)
    router.refresh()
  }, [
    clearPersistedSessionToken,
    finalizeSessionWithToken,
    router,
    waitForMiddlewareSessionReadiness,
    waitForSessionBootstrap,
  ])

  const retryFinalizeLogin = useCallback(async () => {
    if (!pendingRedirectPath) return
    await finalizeLoginAndNavigate(pendingRedirectPath)
  }, [finalizeLoginAndNavigate, pendingRedirectPath])

  // Handle case where user is redirected to a specific step without session data
  // Avoid route-level redirects that can cause middleware loops; instead, fall back to login step in-place
  React.useEffect(() => {
    if (['otp', 'mpin-setup', 'mpin-verify'].includes(initialStep) && !authData.sessionToken) {
      console.warn('[MobileAuthFlow] Missing sessionToken for step', initialStep, '→ trying to restore from sessionStorage.');
      const restored = readPersistedSessionToken();
      if (restored) {
        console.log('[MobileAuthFlow] Restored sessionToken from sessionStorage. Proceeding.');
        setAuthData((prev) => ({ ...prev, sessionToken: restored }));
        // Keep currentStep aligned to initial target (otp/mpin-*). Parent handles exact step selection on success.
        if (initialStep === 'otp') setCurrentStep('otp');
      } else {
        console.warn('[MobileAuthFlow] No sessionToken available. Falling back to login step to avoid redirect loop.');
        setCurrentStep('login');
      }
    }
  }, [initialStep, authData.sessionToken, readPersistedSessionToken])

  const handleLoginSuccess = (data: AuthData) => {
    console.log('[MobileAuthFlow] Login success payload:', data);
    setIsFinalizingLogin(false)
    setFinalizationError("")
    setPendingRedirectPath(undefined)
    setAuthData(data)
    persistSessionToken(data.sessionToken)
    
    if (data.requiresOtp) {
      console.log('[MobileAuthFlow] Moving to step: otp');
      setCurrentStep('otp')
    } else if (data.requiresMpin) {
      console.log('[MobileAuthFlow] Moving to step: mpin-verify');
      setCurrentStep('mpin-verify')
    } else if (data.redirectTo) {
      // Handle direct redirects (like KYC)
      console.log('[MobileAuthFlow] Redirecting to:', data.redirectTo);
      router.push(data.redirectTo)
    }
  }

  const handleRegistrationSuccess = (data: AuthData) => {
    console.log('[MobileAuthFlow] Registration success payload:', data);
    setIsFinalizingLogin(false)
    setFinalizationError("")
    setPendingRedirectPath(undefined)
    setAuthData(data)
    persistSessionToken(data.sessionToken)
    
    if (data.requiresOtp) {
      console.log('[MobileAuthFlow] Moving to step: otp');
      setCurrentStep('otp')
    }
  }

  const handleOtpVerificationSuccess = (data: AuthData) => {
    console.log("🔄 OTP Verification Success:", data);
    setIsFinalizingLogin(false)
    setFinalizationError("")
    setPendingRedirectPath(undefined)
    setAuthData({ ...authData, ...data })
    
    if (data.userData?.canSetupMpin) {
      console.log("✅ Going to mPin setup mode");
      setCurrentStep('mpin-setup')
    } else if (data.requiresMpin) {
      console.log("✅ Going to mPin verify mode");
      setCurrentStep('mpin-verify')
    } else if (data.redirectTo) {
      console.log("✅ Redirecting to:", data.redirectTo);
      router.push(data.redirectTo)
    }
  }

  const handleMpinSuccess = async (data: AuthData) => {
    const targetPath = data.redirectTo || getAppRoute("dashboard")
    await finalizeLoginAndNavigate(targetPath)
  }

  const handleBack = () => {
    console.log('[MobileAuthFlow] Back pressed from step:', currentStep);
    switch (currentStep) {
      case 'otp':
        setCurrentStep(initialStep === 'register' ? 'register' : 'login')
        break
      case 'mpin-setup':
      case 'mpin-verify':
        setCurrentStep('otp')
        break
      default:
        setCurrentStep('login')
    }
  }

  const switchToRegister = () => {
    console.log('[MobileAuthFlow] Switching to register');
    setCurrentStep('register')
    setAuthData({})
  }

  const switchToLogin = () => {
    console.log('[MobileAuthFlow] Switching to login');
    setCurrentStep('login')
    setAuthData({})
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'login':
        return (
          <MobileLoginForm 
            onLoginSuccess={handleLoginSuccess}
            initialBannerError={loginUrlError}
          />
        )
      
      case 'register':
        return (
          <MobileRegistrationForm 
            onRegistrationSuccess={handleRegistrationSuccess}
          />
        )
      
      case 'otp':
        return (
          <OtpVerificationForm
            sessionToken={authData.sessionToken!}
            userData={authData.userData}
            onVerificationSuccess={handleOtpVerificationSuccess}
            onBack={handleBack}
          />
        )
      
      case 'mpin-setup':
        return (
          <MpinForm
            sessionToken={authData.sessionToken!}
            mode="setup"
            userData={authData.userData}
            onSuccess={handleMpinSuccess}
            onBack={handleBack}
            isFinalizingLogin={isFinalizingLogin}
            finalizationError={finalizationError}
            onRetryFinalization={retryFinalizeLogin}
          />
        )
      
      case 'mpin-verify':
        return (
          <MpinForm
            sessionToken={authData.sessionToken!}
            mode="verify"
            userData={authData.userData}
            onSuccess={handleMpinSuccess}
            onBack={handleBack}
            isFinalizingLogin={isFinalizingLogin}
            finalizationError={finalizationError}
            onRetryFinalization={retryFinalizeLogin}
          />
        )
      
      default:
        return (
          <MobileLoginForm 
            onLoginSuccess={handleLoginSuccess}
            initialBannerError={loginUrlError}
          />
        )
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 w-screen">
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="hidden lg:flex relative h-full min-h-[640px] rounded-3xl overflow-hidden border border-slate-200/50 bg-slate-900 shadow-2xl group">
          {/* Abstract 3D Tech Background Image */}
          <div className="absolute inset-0 transition-transform duration-1000 ease-out group-hover:scale-105">
            <Image 
              src={BRAND_ASSETS.illustrations.auth3D}
              alt="Premium Trading Platform"
              fill
              className="object-cover opacity-80 mix-blend-overlay"
              priority
            />
            {/* Gradient Overlay for Text Readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-primary/30 to-transparent mix-blend-multiply" />
          </div>

          <div className="relative z-10 flex flex-col justify-end p-10 w-full">
            <div className="space-y-6 max-w-md backdrop-blur-md bg-slate-900/40 p-8 rounded-2xl border border-white/10 shadow-2xl">
              <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur-md shadow-sm">
                {BRAND_IDENTITY.names.full} Premium
              </div>
              <h2 className="text-3xl font-bold leading-tight text-white drop-shadow-sm">
                Professional trading experience built for every screen.
              </h2>
              <p className="text-sm text-slate-200 leading-relaxed">
                Continue your secure sign-in journey with OTP and mPin verification in a polished desktop workspace. Access zero brokerage and up to 500x margin.
              </p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md md:max-w-lg xl:max-w-xl mx-auto lg:mx-0 lg:justify-self-end">
          {/* Progress indicator */}
          <div className="mb-6">
            <div className="flex items-center justify-center space-x-2">
              <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                ['login', 'register'].includes(currentStep) ? 'bg-primary shadow-[0_0_8px_rgba(var(--color-primary),0.6)]' : 'bg-slate-300'
              }`} />
              <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                currentStep === 'otp' ? 'bg-primary shadow-[0_0_8px_rgba(var(--color-primary),0.6)]' : 'bg-slate-300'
              }`} />
              <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                ['mpin-setup', 'mpin-verify'].includes(currentStep) ? 'bg-primary shadow-[0_0_8px_rgba(var(--color-primary),0.6)]' : 'bg-slate-300'
              }`} />
            </div>
            <div className="text-center mt-3 text-sm font-medium text-slate-500">
              {currentStep === 'login' && 'Step 1: Account Access'}
              {currentStep === 'register' && 'Step 1: Account Creation'}
              {currentStep === 'otp' && 'Step 2: Mobile Verification'}
              {currentStep === 'mpin-setup' && 'Step 3: Secure Device'}
              {currentStep === 'mpin-verify' && 'Step 3: Secure Access'}
            </div>
          </div>

          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {renderCurrentStep()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Switch between login/register */}
          {['login', 'register'].includes(currentStep) && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              transition={{ delay: 0.4 }}
              className="text-center mt-6"
            >
              {currentStep === 'login' ? (
                <p className="text-sm text-slate-600">
                  {`New to ${BRAND_IDENTITY.names.full}?`}{' '}
                  <button
                    onClick={switchToRegister}
                    className="text-primary hover:text-primary/80 font-semibold transition-colors"
                  >
                    Create an account
                  </button>
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  Already have an account?{' '}
                  <button
                    onClick={switchToLogin}
                    className="text-primary hover:text-primary/80 font-semibold transition-colors"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MobileAuthFlow
