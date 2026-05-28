/**
 * File:        middleware.ts
 * Module:      Edge · Auth + maintenance + KYC gate
 * Purpose:     Single Edge middleware enforcing auth, maintenance, KYC, and admin route gating.
 *
 * Exports:
 *   - default authEdge handler
 *   - config — Next.js matcher excluding _next/static, images, and asset extensions
 *
 * Depends on:
 *   - @/auth-edge — JWT decode (Edge-safe)
 *   - @/lib/maintenance — env-only gate via getMaintenanceEnvFallbackGate (fallback only)
 *   - @/lib/kyc-enforcement — sync env path via isKycEnforcementEnabledSync (fallback only)
 *
 * Side-effects: none beyond NextResponse construction and isolate-local caching
 *
 * Key invariants:
 *   - Fetches live DB status from /api/maintenance/status and /api/kyc/config
 *     but caches results for 10 seconds in-memory (isolate-global) to preserve
 *     high performance and 0ms latency for most requests.
 *   - Falls back to environment variables (MAINTENANCE_MODE, KYC_ENFORCEMENT_ENABLED)
 *     if the API fetch fails, ensuring the system remains gated even during DB downtime.
 *
 * Read order:
 *   1. config matcher — what runs through here
 *   2. default handler — top-down auth/maintenance/KYC gating
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import { authEdge } from "@/auth-edge"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { authSessionMiddlewareDebug, isAuthSessionTraceEnabled, prefixId } from "@/lib/auth-session-debug"
import { getMaintenanceEnvFallbackGate } from "@/lib/maintenance"
import { isKycEnforcementEnabledSync } from "@/lib/kyc-enforcement"
import { getMiddlewareRouteConfig, matchesRoutePattern, resolveRouteTranslation } from "@/lib/branding-routes"

const MIDDLEWARE_DEBUG = process.env.MIDDLEWARE_DEBUG === "1"
function mlog(...args: unknown[]): void {
  if (MIDDLEWARE_DEBUG) console.log(...args)
}

/**
 * Public non-UI routes that stay static regardless of branding slugs.
 */
const staticPublicRoutes = [
  "/api/graphql",
  "/api/quotes",
  "/api/quotes/docs",
  "/api/otp/*",
  "/api/mpin/*",
  "/api/kyc/config",
  "/api/health",
  "/api/ready",
  "/api/metrics",
  "/api/auth/*",
  // Mobile app REST endpoints (must NOT be under /api/auth/* — NextAuth intercepts those)
  "/api/mobile/login",
  "/api/mobile/token",
  // Milli-search proxy (public; used by frontend, no auth required)
  "/api/milli-search",
  "/api/milli-search/*",
  // Allow console API to handle auth itself (returns 401 JSON)
  // Prevent middleware redirect which breaks client fetch with HTML responses
  "/api/console",
  // Static CSV for instruments master (served from /public)
  "/marketInstrumentsData.csv"
]

const privilegedBypassRoles = new Set(["ADMIN", "MODERATOR", "SUPER_ADMIN"]);
/** APIs users may call while KYC is pending (deposit proof upload + payment config for /console). */
const kycAllowedApiPrefixes = ["/api/kyc", "/api/upload", "/api/settings/payment"];

function isKycAllowedApiRoute(pathname: string): boolean {
  return kycAllowedApiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Detect requests for static assets (public/ files) that must NOT be redirected.
 * This is critical on Vercel because middleware redirects (307) break CSS/images.
 */
function isStaticAssetRequest(pathname: string): boolean {
  // Next internals or common static endpoints
  if (pathname.startsWith("/_next/")) return true
  if (pathname === "/favicon.ico") return true

  // Public asset folders we serve directly
  if (pathname.startsWith("/branding/")) return true

  // Any path with a file extension (e.g. .png, .jpg, .css, .js, .woff2)
  return /\.[a-zA-Z0-9]+$/.test(pathname)
}

function canBypassMaintenanceByRole(userRole: string | undefined, allowAdminBypass: boolean): boolean {
  if (userRole === "SUPER_ADMIN") {
    return true
  }
  if (!allowAdminBypass) {
    return false
  }
  const allowedRoles = ["ADMIN", "SUPER_ADMIN"] as const
  return userRole ? allowedRoles.includes(userRole as (typeof allowedRoles)[number]) : false
}

/** True when Edge session has a non-empty user id (matches Node session gating; avoids `!!req.auth` with stripped user). */
function hasUsableAuthSession(auth: unknown): boolean {
  const id = (auth as { user?: { id?: unknown } } | null)?.user?.id
  return typeof id === "string" && id.trim().length > 0
}

/** Edge middleware must not import Node `crypto`; use Web Crypto (available in Edge runtime). */
function newTraceRequestId(): string {
  return globalThis.crypto.randomUUID()
}

function ensureTraceRequestId(req: NextRequest): string {
  const incoming = req.headers.get("x-request-id")?.trim()
  return incoming && incoming.length > 0 ? incoming : newTraceRequestId()
}

function nextWithTrace(req: NextRequest): NextResponse {
  if (!isAuthSessionTraceEnabled()) return NextResponse.next()
  const rid = ensureTraceRequestId(req)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-request-id", rid)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set("x-request-id", rid)
  return res
}

function rewriteWithTrace(req: NextRequest, rewriteUrl: URL): NextResponse {
  if (!isAuthSessionTraceEnabled()) return NextResponse.rewrite(rewriteUrl)
  const rid = ensureTraceRequestId(req)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-request-id", rid)
  const res = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
  res.headers.set("x-request-id", rid)
  return res
}

function redirectWithTrace(req: NextRequest, url: URL): NextResponse {
  const res = NextResponse.redirect(url)
  if (isAuthSessionTraceEnabled()) {
    res.headers.set("x-request-id", ensureTraceRequestId(req))
  }
  return res
}

function jsonWithTrace(req: NextRequest, body: unknown, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(body, init)
  if (isAuthSessionTraceEnabled()) {
    res.headers.set("x-request-id", ensureTraceRequestId(req))
  }
  return res
}

/**
 * Edge-safe gate read with in-memory isolate cache.
 * Provides 0ms latency for 99% of requests while reflecting DB changes within 10s.
 */
let cachedMaintenance: { active: boolean; allowBypass: boolean } | null = null
let lastMaintenanceCheck = 0
let cachedKycEnabled: boolean | null = null
let lastKycCheck = 0
const EDGE_CACHE_TTL_MS = 10000 // 10 seconds

async function resolveCachedMaintenanceGate(req: NextRequest): Promise<{ active: boolean; allowBypass: boolean }> {
  const now = Date.now()
  if (cachedMaintenance && now - lastMaintenanceCheck < EDGE_CACHE_TTL_MS) {
    return cachedMaintenance
  }

  try {
    const url = new URL("/api/maintenance/status", req.nextUrl.origin)
    // Short timeout to prevent middleware hanging
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      const json = await res.json()
      if (json.success && json.data) {
        cachedMaintenance = {
          active: !!json.data.isMaintenanceMode,
          allowBypass: !!json.data.allowAdminBypass,
        }
        lastMaintenanceCheck = now
        mlog(`[MIDDLEWARE] 🔄 Maintenance cache updated from DB:`, cachedMaintenance)
        return cachedMaintenance
      }
    }
  } catch (e) {
    mlog(`[MIDDLEWARE] ⚠️ Failed to fetch live maintenance status, falling back to env:`, e)
  }

  return getMaintenanceEnvFallbackGate()
}

async function resolveCachedKycEnforcement(req: NextRequest): Promise<boolean> {
  const now = Date.now()
  if (cachedKycEnabled !== null && now - lastKycCheck < EDGE_CACHE_TTL_MS) {
    return cachedKycEnabled
  }

  try {
    const url = new URL("/api/kyc/config", req.nextUrl.origin)
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      const json = await res.json()
      if (json.success && typeof json.enabled === "boolean") {
        cachedKycEnabled = json.enabled
        lastKycCheck = now
        mlog(`[MIDDLEWARE] 🔄 KYC cache updated from DB:`, { enabled: cachedKycEnabled })
        return !!json.enabled
      }
    }
  } catch (e) {
    mlog(`[MIDDLEWARE] ⚠️ Failed to fetch live KYC config, falling back to env:`, e)
  }

  return isKycEnforcementEnabledSync()
}

export default authEdge(async (req) => {
  const nextReq = req as NextRequest
  const { nextUrl } = req;
  const isLoggedIn = hasUsableAuthSession(req.auth);
  const routeConfig = getMiddlewareRouteConfig()
  
  // 0. STATIC ASSET BYPASS (must happen before any auth redirects)
  if (isStaticAssetRequest(nextUrl.pathname)) {
    return NextResponse.next()
  }

  // Let the status route through without recursive maintenance fetch/deadlock
  if (nextUrl.pathname === "/api/maintenance/status" || nextUrl.pathname === "/api/kyc/config") {
    return NextResponse.next()
  }

  const routeTranslation = resolveRouteTranslation(nextUrl.pathname)
  const rewriteTargetPath = routeTranslation?.rewriteTo || null

  const allowRequest = (): NextResponse => {
    if (!rewriteTargetPath) return nextWithTrace(nextReq)
    const rewriteUrl = nextUrl.clone()
    rewriteUrl.pathname = rewriteTargetPath
    return rewriteWithTrace(nextReq, rewriteUrl)
  }

  if (routeTranslation?.redirectTo) {
    const redirectUrl = nextUrl.clone()
    redirectUrl.pathname = routeTranslation.redirectTo
    return redirectWithTrace(nextReq, redirectUrl)
  }

  mlog(`[MIDDLEWARE] 🔍 Request to: ${nextUrl.pathname}, Logged in: ${isLoggedIn}`);

  // 0. MAINTENANCE MODE CHECK - in-memory isolate cache (refreshed from DB every 10s)
  const maintenanceGate = await resolveCachedMaintenanceGate(nextReq)
  if (maintenanceGate.active) {
    mlog(`[MIDDLEWARE] 🔧 Maintenance mode is active`);

    if (nextUrl.pathname === "/maintenance" || nextUrl.pathname.startsWith("/api/maintenance/")) {
      return nextWithTrace(nextReq);
    }

    const user = (req.auth as any)?.user;
    const userRole = user?.role as string | undefined;

    if (canBypassMaintenanceByRole(userRole, maintenanceGate.allowBypass)) {
      mlog(`[MIDDLEWARE] ✅ Admin bypass granted for role: ${userRole}`);
    } else {
      // API clients (fetch / EventSource) expect JSON; avoid HTML redirect to /maintenance
      if (nextUrl.pathname.startsWith("/api/")) {
        return jsonWithTrace(
          nextReq,
          {
            success: false,
            error: "Service temporarily unavailable — maintenance in progress.",
            code: "MAINTENANCE",
            timestamp: new Date().toISOString(),
          },
          { status: 503 },
        )
      }
      return redirectWithTrace(nextReq, new URL("/maintenance", nextUrl));
    }
  }

  // CORS preflight handling: never redirect OPTIONS
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('origin') || '*';
    const allowHeaders = req.headers.get('access-control-request-headers') || 'Content-Type, Authorization, Accept, X-Requested-With';
    const res = new NextResponse(null, { status: 204 });
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Vary', 'Origin');
    res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', allowHeaders);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Access-Control-Max-Age', '86400');
    return res;
  }

  // Enhanced user data from session
  const user = (req.auth as any)?.user;
  const kycStatus = user?.kycStatus as string | undefined;
  const phoneVerified = user?.phoneVerified as boolean | undefined;
  const hasMpin = user?.hasMpin as boolean | undefined;
  const userRole = user?.role as string | undefined;
  // KYC enforcement: in-memory isolate cache (refreshed from DB every 10s).
  const kycEnforcementEnabled = await resolveCachedKycEnforcement(nextReq);

  const sessionSecurityStepUpPending = Boolean((user as { sessionSecurityStepUpPending?: boolean } | undefined)?.sessionSecurityStepUpPending);

  // Route classification flags
  const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth");
  const isPublicRoute = [...routeConfig.publicPageRoutes, ...staticPublicRoutes].some((route) =>
    matchesRoutePattern(nextUrl.pathname, route)
  );
  const isAuthRoute = routeConfig.authRoutes.some((route) => matchesRoutePattern(nextUrl.pathname, route));
  const isPhoneVerificationRoute = routeConfig.phoneVerificationRoutes.some((route) =>
    matchesRoutePattern(nextUrl.pathname, route)
  );
  const isMpinRoute = routeConfig.mpinRoutes.some((route) => matchesRoutePattern(nextUrl.pathname, route));
  const isSessionSecurityStepUpRoute = routeConfig.sessionSecurityStepUpRoutes.some((route) =>
    matchesRoutePattern(nextUrl.pathname, route)
  );
  const isPasswordResetRoute = routeConfig.passwordResetRoutes.some((route) =>
    matchesRoutePattern(nextUrl.pathname, route)
  );
  const isApiRoute = nextUrl.pathname.startsWith("/api/");
  const isAdminApiRoute =
    nextUrl.pathname === "/api/admin" || nextUrl.pathname.startsWith("/api/admin/");
  const isSuperAdminApiRoute =
    nextUrl.pathname === "/api/super-admin" || nextUrl.pathname.startsWith("/api/super-admin/");
  // Check if route is an admin route - includes /admin/* and /admin-console/* (branding-aware)
  const isAdminRoute = routeConfig.adminRouteRoots.some(
    (routeRoot) => nextUrl.pathname === routeRoot || nextUrl.pathname.startsWith(`${routeRoot}/`)
  );

  // Debug logging for route classification
  mlog(`[MIDDLEWARE] 📊 Route flags:`, {
    isApiAuthRoute,
    isPublicRoute,
    isAuthRoute,
    isPasswordResetRoute,
    isPhoneVerificationRoute,
    isMpinRoute,
    isSessionSecurityStepUpRoute,
    isApiRoute,
    isAdminApiRoute,
    isSuperAdminApiRoute,
    isAdminRoute,
    kycEnforcementEnabled,
  });

  // 1. Allow NextAuth specific API routes to always pass through
  if (isApiAuthRoute) {
    mlog(`[MIDDLEWARE] ✅ API auth route - allowing`);
    if (nextUrl.pathname === "/api/auth/session") {
      const rid = isAuthSessionTraceEnabled() ? ensureTraceRequestId(nextReq) : undefined
      authSessionMiddlewareDebug("mw:session_request", {
        requestId: rid,
        pathname: nextUrl.pathname,
        usableLogin: isLoggedIn,
        hasUser: !!user && typeof user === "object",
        uidPrefix: prefixId((user as { id?: string } | undefined)?.id),
        stepUpPending: sessionSecurityStepUpPending,
      })
    }
    return nextWithTrace(nextReq);
  }

  if (isLoggedIn && sessionSecurityStepUpPending) {
    const allowWhileStepUp =
      isSessionSecurityStepUpRoute ||
      isPublicRoute ||
      isPasswordResetRoute ||
      nextUrl.pathname === "/maintenance" ||
      nextUrl.pathname.startsWith("/api/maintenance/");
    if (!allowWhileStepUp) {
      if (isApiRoute) {
        return jsonWithTrace(
          nextReq,
          {
            success: false,
            error: "Session security verification required",
            code: "SESSION_SECURITY_STEP_UP",
          },
          { status: 403 },
        );
      }
      const target =
        routeConfig.sessionSecurityStepUpRoutes[0] ?? `${routeConfig.authLoginRoute.replace(/\/login$/, "")}/session-security-step-up`;
      return redirectWithTrace(nextReq, new URL(target, nextUrl));
    }
  }

  // 1.5 API routes should return JSON auth errors (never redirect HTML for fetch clients)
  if (isApiRoute) {
    if (isPublicRoute) {
      mlog(`[MIDDLEWARE] ✅ Public API route - allowing`);
      return nextWithTrace(nextReq);
    }

    if (!isLoggedIn) {
      // Mobile app sends JWT as Authorization: Bearer — let the route handler
      // decode it via requireAuthenticatedUserId(). The middleware (Edge runtime)
      // only reads cookies; Bearer decode happens in Node.js route handlers.
      const authHeader = req.headers.get("authorization")
      if (authHeader && authHeader.startsWith("Bearer ")) {
        mlog(`[MIDDLEWARE] ✅ Bearer token present - passing to route handler for auth`)
        return nextWithTrace(nextReq)
      }
      mlog(`[MIDDLEWARE] 🔒 API route access without login - returning 401 JSON`);
      return jsonWithTrace(
        nextReq,
        { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    if (isSuperAdminApiRoute && userRole !== "SUPER_ADMIN") {
      mlog(`[MIDDLEWARE] ❌ Super Admin required for API (role: ${userRole})`);
      return jsonWithTrace(
        nextReq,
        { success: false, error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    if (
      isAdminApiRoute &&
      userRole !== "ADMIN" &&
      userRole !== "MODERATOR" &&
      userRole !== "SUPER_ADMIN"
    ) {
      mlog(`[MIDDLEWARE] ❌ Admin role required for API (role: ${userRole})`);
      return jsonWithTrace(
        nextReq,
        { success: false, error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    // Strict KYC API gating for regular users:
    // once phone + mPin are complete, only KYC APIs are allowed until approval.
    const isPrivilegedUser = privilegedBypassRoles.has(userRole || "");
    if (
      kycEnforcementEnabled &&
      !isPrivilegedUser &&
      phoneVerified &&
      hasMpin &&
      kycStatus !== "APPROVED" &&
      !isKycAllowedApiRoute(nextUrl.pathname)
    ) {
      mlog(`[MIDDLEWARE] ❌ API blocked due to pending/incomplete KYC: ${nextUrl.pathname}`);
      return jsonWithTrace(
        nextReq,
        {
          success: false,
          error: "KYC verification required",
          code: "KYC_REQUIRED",
          redirectTo: routeConfig.authKycRoute,
        },
        { status: 403 },
      );
    }

    mlog(`[MIDDLEWARE] ✅ Protected API route - allowing`);
    return nextWithTrace(nextReq);
  }

  // 2. Allow public routes
  if (isPublicRoute) {
    mlog(`[MIDDLEWARE] ✅ Public route - allowing`);
    return allowRequest();
  }

  // 2.25. CRITICAL: Allow password reset routes for EVERYONE (logged in or not)
  // This is essential for password recovery functionality
  if (isPasswordResetRoute) {
    mlog(`[MIDDLEWARE] 🔓 Password reset route - allowing access for all users (logged in: ${isLoggedIn})`);
    return allowRequest();
  }

  // 2.5. Admin route access control
  if (isAdminRoute) {
    mlog(`[MIDDLEWARE] 🛡️ Admin route detected`);
    if (!isLoggedIn) {
      mlog(`[MIDDLEWARE] ❌ Not logged in - redirecting to login`);
      return redirectWithTrace(nextReq, new URL(routeConfig.authLoginRoute, nextUrl));
    }

    // Edge→Node fallback: if JWT is missing role, fetch fresh from Node API
    if (!userRole) {
      mlog(`[MIDDLEWARE] ⚠️ Role missing in JWT — attempting Edge→Node fallback`);
      try {
        const meUrl = new URL("/api/admin/me", nextUrl.origin);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const meRes = await fetch(meUrl.toString(), {
          headers: { cookie: nextReq.headers.get("cookie") ?? "" },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (meRes.ok) {
          const meData = (await meRes.json()) as { success?: boolean; user?: { role?: string } };
          const freshRole = meData?.user?.role;
          if (freshRole === "ADMIN" || freshRole === "MODERATOR" || freshRole === "SUPER_ADMIN") {
            mlog(`[MIDDLEWARE] ✅ Edge→Node fallback confirmed role: ${freshRole}`);
            mlog(`[MIDDLEWARE] ✅ Admin access granted`);
            return allowRequest();
          }
        }
      } catch (e) {
        mlog(`[MIDDLEWARE] ❌ Edge→Node fallback failed:`, e);
      }
      // Fallback failed — include error code in redirect
      const redirectUrl = new URL(routeConfig.dashboardRoute, nextUrl);
      redirectUrl.searchParams.set("auth_error", "role_mismatch");
      mlog(`[MIDDLEWARE] ❌ Insufficient permissions (role: ${userRole ?? "undefined"}) - redirecting to dashboard`);
      return redirectWithTrace(nextReq, redirectUrl);
    }

    if (userRole !== 'ADMIN' && userRole !== 'MODERATOR' && userRole !== 'SUPER_ADMIN') {
      const redirectUrl = new URL(routeConfig.dashboardRoute, nextUrl);
      redirectUrl.searchParams.set("auth_error", "insufficient_role");
      mlog(`[MIDDLEWARE] ❌ Insufficient permissions (role: ${userRole}) - redirecting to dashboard`);
      return redirectWithTrace(nextReq, redirectUrl);
    }

    mlog(`[MIDDLEWARE] ✅ Admin access granted`);
    return allowRequest();
  }

  // 2.75. Normalize direct /auth/kyc access for logged-in users.
  if (isLoggedIn && nextUrl.pathname === routeConfig.authKycRoute) {
    mlog(`[MIDDLEWARE] 🔍 Logged-in user accessing /auth/kyc - validating stage gates`);

    if (!phoneVerified) {
      mlog(`[MIDDLEWARE] ⚠️ /auth/kyc blocked - phone not verified`);
      return redirectWithTrace(nextReq, new URL(routeConfig.phoneVerificationRoutes[0], nextUrl));
    }

    if (!hasMpin) {
      mlog(`[MIDDLEWARE] ⚠️ /auth/kyc blocked - mPin not set`);
      return redirectWithTrace(nextReq, new URL(routeConfig.mpinRoutes[0], nextUrl));
    }

    if (!kycEnforcementEnabled) {
      mlog(`[MIDDLEWARE] ✅ /auth/kyc blocked - KYC enforcement disabled, redirecting dashboard`);
      return redirectWithTrace(nextReq, new URL(routeConfig.dashboardRoute, nextUrl));
    }

    if (kycStatus === "APPROVED") {
      mlog(`[MIDDLEWARE] ✅ /auth/kyc blocked - KYC already approved, redirecting dashboard`);
      return redirectWithTrace(nextReq, new URL(routeConfig.dashboardRoute, nextUrl));
    }

    mlog(`[MIDDLEWARE] ✅ /auth/kyc allowed for pending/incomplete KYC`);
    return allowRequest();
  }

  // 3. If the user is fully authenticated and tries to access auth routes,
  //    redirect them to appropriate page based on their status
  //    EXCEPTION: Password reset routes are handled above and always allowed
  if (
    isLoggedIn &&
    isAuthRoute &&
    !isPhoneVerificationRoute &&
    !isMpinRoute &&
    !isPasswordResetRoute &&
    !isSessionSecurityStepUpRoute &&
    nextUrl.pathname !== routeConfig.authKycRoute
  ) {
    mlog(`[MIDDLEWARE] 🔄 Logged-in user accessing auth route - checking completion status`);
    
    // Check user completion status and redirect accordingly
    if (!phoneVerified) {
      mlog(`[MIDDLEWARE] ⚠️ Phone not verified - redirecting to phone verification`);
      return redirectWithTrace(nextReq, new URL(routeConfig.phoneVerificationRoutes[0], nextUrl));
    }
    
    if (!hasMpin) {
      mlog(`[MIDDLEWARE] ⚠️ mPin not set - redirecting to mPin setup`);
      return redirectWithTrace(nextReq, new URL(routeConfig.mpinRoutes[0], nextUrl));
    }
    
    if (kycEnforcementEnabled && kycStatus !== "APPROVED") {
      mlog(`[MIDDLEWARE] ⚠️ KYC not approved (status: ${kycStatus}) - redirecting to KYC`);
      return redirectWithTrace(nextReq, new URL(routeConfig.authKycRoute, nextUrl));
    }
    
    mlog(`[MIDDLEWARE] ✅ User fully verified - redirecting to dashboard`);
    return redirectWithTrace(nextReq, new URL(routeConfig.dashboardRoute, nextUrl));
  }

  // 4. If the user is NOT logged in and is trying to access a protected route,
  //    redirect them to the login page.
  if (!isLoggedIn && !isPublicRoute && !isAuthRoute) {
    mlog(`[MIDDLEWARE] 🔒 Protected route access without login - redirecting to login`);
    let callbackUrl = nextUrl.pathname;
    if (nextUrl.search) {
      callbackUrl += nextUrl.search;
    }
    const encodedCallbackUrl = encodeURIComponent(callbackUrl);
    return redirectWithTrace(
      nextReq,
      new URL(`${routeConfig.authLoginRoute}?callbackUrl=${encodedCallbackUrl}`, nextUrl),
    );
  }

  // 5. Enhanced gating for logged-in users (ensure proper verification flow)
  if (isLoggedIn && !isAuthRoute && !isPublicRoute && !isPasswordResetRoute) {
    mlog(`[MIDDLEWARE] 🔐 Logged-in user on protected route - checking verification status`);
    
    // Phone verification gating
    if (!phoneVerified && !isPhoneVerificationRoute) {
      mlog(`[MIDDLEWARE] ⚠️ Phone verification required - redirecting`);
      return redirectWithTrace(nextReq, new URL(routeConfig.phoneVerificationRoutes[0], nextUrl));
    }
    
    // mPin setup gating
    if (phoneVerified && !hasMpin && !isMpinRoute) {
      mlog(`[MIDDLEWARE] ⚠️ mPin setup required - redirecting`);
      return redirectWithTrace(nextReq, new URL(routeConfig.mpinRoutes[0], nextUrl));
    }
    
    // KYC gating - only after phone and mPin are complete
    if (
      kycEnforcementEnabled &&
      phoneVerified && 
      hasMpin && 
      nextUrl.pathname !== routeConfig.authKycRoute &&
      !nextUrl.pathname.startsWith("/api/") &&
      kycStatus !== "APPROVED"
    ) {
      mlog(`[MIDDLEWARE] ⚠️ KYC verification required (status: ${kycStatus}) - redirecting`);
      return redirectWithTrace(nextReq, new URL(routeConfig.authKycRoute, nextUrl));
    }
    
    mlog(`[MIDDLEWARE] ✅ User verification checks passed`);
  }

  // 6. Special handling for trading routes - require full verification
  if (
    isLoggedIn && 
    nextUrl.pathname.startsWith("/trading") &&
    (!phoneVerified || !hasMpin || (kycEnforcementEnabled && kycStatus !== "APPROVED"))
  ) {
    mlog(`[MIDDLEWARE] 📊 Trading route - enforcing full verification`);
    if (!phoneVerified) {
      mlog(`[MIDDLEWARE] ❌ Trading blocked - phone not verified`);
      return redirectWithTrace(nextReq, new URL(routeConfig.phoneVerificationRoutes[0], nextUrl));
    }
    if (!hasMpin) {
      mlog(`[MIDDLEWARE] ❌ Trading blocked - mPin not set`);
      return redirectWithTrace(nextReq, new URL(routeConfig.mpinRoutes[0], nextUrl));
    }
    if (kycEnforcementEnabled && kycStatus !== "APPROVED") {
      mlog(`[MIDDLEWARE] ❌ Trading blocked - KYC not approved`);
      return redirectWithTrace(nextReq, new URL(routeConfig.authKycRoute, nextUrl));
    }
  }

  // If none of the above conditions match, allow the request to proceed
  mlog(`[MIDDLEWARE] ✅ Request allowed - proceeding to ${nextUrl.pathname}`);
  return allowRequest();
});

// This config specifies which routes the middleware should be invoked on.
export const config = {
  // Exclude next internals + any file with an extension (public assets, css/js/fonts/images, etc.)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|vercel.svg|next.svg|.*\\..*).*)"],
};