/**
 * @file lib/branding-routes.ts
 * @module lib
 * @description Central route helpers for branding-driven slug paths, rewrites, and redirects.
 * @author StockTrade
 * @created 2026-02-20
 */

import { BRAND_IDENTITY, type BrandRouteTemplateGroups } from "@/Branding/identity"
import { getBrandSlug, getLegacyBrandSlugs, resolveRouteTemplate } from "@/Branding"

export type MarketingRouteKey = keyof BrandRouteTemplateGroups["marketing"]
export type AuthRouteKey = keyof BrandRouteTemplateGroups["auth"]
export type AppRouteKey = keyof BrandRouteTemplateGroups["app"]
type RouteBindingId = `${"marketing" | "auth" | "app"}.${string}`

const INTERNAL_ROUTE_TEMPLATES: BrandRouteTemplateGroups = {
  marketing: {
    home: "/",
    blog: "/blog",
    newsBlogs: "/news-blogs",
    contact: "/contact",
    whyUs: "/why-stocktrade",
    affiliate: "/affiliate",
    privacyPolicy: "/privacy-policy",
    terms: "/terms",
    downloads: "/downloads",
    productsRoot: "/products",
    productsCfdInstrument: "/products/cfd-instrument",
    productsIndexes: "/products/indexes",
    productsStocks: "/products/stocks",
    productsCommodity: "/products/commodity",
    paymentMethodsRoot: "/payment-method",
    paymentBankTransfer: "/payment-method/bank-transfer",
    paymentUpiTransfer: "/payment-method/upi-transfer",
    paymentCashPayment: "/payment-method/cash-payment",
    paymentCryptoUsdtTrc20: "/payment-method/crypto-usdt-trc20",
  },
  auth: {
    root: "/auth",
    error: "/auth/error",
    login: "/auth/login",
    register: "/auth/register",
    forgotPassword: "/auth/forgot-password",
    passwordReset: "/auth/password-reset",
    emailVerification: "/auth/email-verification",
    otpVerification: "/auth/otp-verification",
    mpinSetup: "/auth/mpin-setup",
    mpinVerify: "/auth/mpin-verify",
    sessionSecurityStepUp: "/auth/session-security-step-up",
    phoneVerification: "/auth/phone-verification",
    kyc: "/auth/kyc",
  },
  app: {
    dashboard: "/dashboard",
    adminRoot: "/admin",
    adminKyc: "/admin/kyc",
    adminConsoleRoot: "/admin-console",
    adminConsoleAccessControl: "/admin-console/access-control",
    adminConsoleAdvanced: "/admin-console/advanced",
    adminConsoleAnalytics: "/admin-console/analytics",
    adminConsoleAudit: "/admin-console/audit",
    adminConsoleCleanup: "/admin-console/cleanup",
    adminConsoleFinancialOverview: "/admin-console/financial-overview",
    adminConsoleFinancialReports: "/admin-console/financial-reports",
    adminConsoleFunds: "/admin-console/funds",
    adminConsoleKyc: "/admin-console/kyc",
    adminConsoleLogs: "/admin-console/logs",
    adminConsoleNotifications: "/admin-console/notifications",
    adminConsoleOrders: "/admin-console/orders",
    adminConsolePositions: "/admin-console/positions",
    adminConsoleRisk: "/admin-console/risk",
    adminConsoleRms: "/admin-console/rms",
    adminConsoleMarketData: "/admin-console/market-data",
    adminConsoleSettings: "/admin-console/settings",
    adminConsoleSystemHealth: "/admin-console/system-health",
    adminConsoleUsers: "/admin-console/users",
    adminConsoleWorkers: "/admin-console/workers",
    consoleRoot: "/console",
  },
}

const PREFIX_ROUTE_IDS = new Set<RouteBindingId>([
  "marketing.productsRoot",
  "marketing.paymentMethodsRoot",
  "auth.root",
  "app.adminRoot",
  "app.adminConsoleRoot",
  "app.consoleRoot",
])

function normalizePath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`
  if (normalized.length > 1 && normalized.endsWith("/")) return normalized.slice(0, -1)
  return normalized
}

function resolveTemplateGroup<T extends Record<string, string>>(templates: T, brandSlug: string): T {
  const resolved = {} as T
  for (const [key, value] of Object.entries(templates)) {
    resolved[key as keyof T] = normalizePath(resolveRouteTemplate(value, brandSlug)) as T[keyof T]
  }
  return resolved
}

function flattenRoutes(routes: BrandRouteTemplateGroups): Record<RouteBindingId, string> {
  const marketing = Object.fromEntries(
    Object.entries(routes.marketing).map(([key, value]) => [`marketing.${key}`, value])
  ) as Record<RouteBindingId, string>
  const auth = Object.fromEntries(
    Object.entries(routes.auth).map(([key, value]) => [`auth.${key}`, value])
  ) as Record<RouteBindingId, string>
  const app = Object.fromEntries(
    Object.entries(routes.app).map(([key, value]) => [`app.${key}`, value])
  ) as Record<RouteBindingId, string>

  return { ...marketing, ...auth, ...app }
}

function isPrefixMatch(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/"
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function swapPrefix(pathname: string, fromPrefix: string, toPrefix: string): string {
  if (pathname === fromPrefix) return toPrefix
  return `${toPrefix}${pathname.slice(fromPrefix.length)}`
}

export function getUiRoutes(brandSlug: string = getBrandSlug()): BrandRouteTemplateGroups {
  return {
    marketing: resolveTemplateGroup(BRAND_IDENTITY.routes.templates.marketing, brandSlug),
    auth: resolveTemplateGroup(BRAND_IDENTITY.routes.templates.auth, brandSlug),
    app: resolveTemplateGroup(BRAND_IDENTITY.routes.templates.app, brandSlug),
  }
}

export function getInternalUiRoutes(brandSlug: string = getBrandSlug()): BrandRouteTemplateGroups {
  return {
    marketing: resolveTemplateGroup(INTERNAL_ROUTE_TEMPLATES.marketing, brandSlug),
    auth: resolveTemplateGroup(INTERNAL_ROUTE_TEMPLATES.auth, brandSlug),
    app: resolveTemplateGroup(INTERNAL_ROUTE_TEMPLATES.app, brandSlug),
  }
}

export function getMarketingRoute(key: MarketingRouteKey): string {
  return getUiRoutes().marketing[key]
}

export function getAuthRoute(key: AuthRouteKey): string {
  return getUiRoutes().auth[key]
}

export function getAppRoute(key: AppRouteKey): string {
  return getUiRoutes().app[key]
}

export function getAdminConsoleRoute(section?: string): string {
  const root = getAppRoute("adminConsoleRoot")
  if (!section || section === "dashboard") return root
  const normalizedSection = section.replace(/^\/+/, "")
  return `${root}/${normalizedSection}`
}

export function getAdminRoute(section?: string): string {
  const root = getAppRoute("adminRoot")
  if (!section || section === "root") return root
  const normalizedSection = section.replace(/^\/+/, "")
  return `${root}/${normalizedSection}`
}

export function buildRouteWithQuery(
  path: string,
  query: Record<string, string | number | boolean | null | undefined> = {},
  hash?: string
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }

  const queryString = params.toString()
  const hashValue = hash ? `#${hash.replace(/^#/, "")}` : ""
  return `${path}${queryString ? `?${queryString}` : ""}${hashValue}`
}

export interface RouteBinding {
  id: RouteBindingId
  current: string
  internal: string
  legacy: string[]
  prefix: boolean
}

function resolveLegacyRouteCandidates(
  routeId: RouteBindingId,
  routeTemplate: string,
  currentPath: string,
  internalPath: string
): string[] {
  const legacyPaths = new Set<string>()

  if (routeTemplate.includes("{brandSlug}")) {
    for (const legacySlug of getLegacyBrandSlugs()) {
      legacyPaths.add(normalizePath(resolveRouteTemplate(routeTemplate, legacySlug)))
    }
  }

  if (internalPath !== currentPath) {
    legacyPaths.add(internalPath)
  }

  legacyPaths.delete(currentPath)
  return Array.from(legacyPaths).filter((path) => path.length > 0)
}

export function getRouteBindings(): RouteBinding[] {
  const currentRoutes = flattenRoutes(getUiRoutes())
  const internalRoutes = flattenRoutes(getInternalUiRoutes())
  const configuredTemplates = flattenRoutes(BRAND_IDENTITY.routes.templates)

  return Object.entries(currentRoutes).map(([id, currentPath]) => {
    const routeId = id as RouteBindingId
    const internalPath = internalRoutes[routeId] || currentPath
    const routeTemplate = configuredTemplates[routeId] || currentPath

    return {
      id: routeId,
      current: normalizePath(currentPath),
      internal: normalizePath(internalPath),
      legacy: resolveLegacyRouteCandidates(routeId, routeTemplate, currentPath, internalPath),
      prefix: PREFIX_ROUTE_IDS.has(routeId),
    }
  })
}

export function resolveRouteTranslation(pathname: string): { redirectTo?: string; rewriteTo?: string } | null {
  const normalizedPathname = normalizePath(pathname)
  const routeBindings = getRouteBindings()
  const orderedBindings = [
    ...routeBindings.filter((route) => !route.prefix),
    ...routeBindings.filter((route) => route.prefix),
  ]

  for (const route of orderedBindings) {
    const matches = route.prefix
      ? (path: string) => isPrefixMatch(normalizedPathname, path)
      : (path: string) => normalizedPathname === path

    const transform = route.prefix
      ? (fromPath: string, toPath: string) => swapPrefix(normalizedPathname, fromPath, toPath)
      : (_fromPath: string, toPath: string) => toPath

    for (const legacyPath of route.legacy) {
      if (matches(legacyPath)) {
        return { redirectTo: transform(legacyPath, route.current) }
      }
    }

    if (route.current !== route.internal && matches(route.internal)) {
      return { redirectTo: transform(route.internal, route.current) }
    }

    if (route.current !== route.internal && matches(route.current)) {
      return { rewriteTo: transform(route.current, route.internal) }
    }
  }

  return null
}

export function matchesRoutePattern(pathname: string, routePattern: string): boolean {
  const normalizedPath = normalizePath(pathname)
  const normalizedPattern = normalizePath(routePattern)
  if (normalizedPattern.endsWith("/*")) {
    return isPrefixMatch(normalizedPath, normalizedPattern.slice(0, -2))
  }
  return normalizedPath === normalizedPattern
}

export interface MiddlewareRouteConfig {
  publicPageRoutes: string[]
  authRoutes: string[]
  phoneVerificationRoutes: string[]
  mpinRoutes: string[]
  sessionSecurityStepUpRoutes: string[]
  passwordResetRoutes: string[]
  adminRouteRoots: string[]
  dashboardRoute: string
  authKycRoute: string
  authLoginRoute: string
}

export function getMiddlewareRouteConfig(): MiddlewareRouteConfig {
  const routes = getUiRoutes()

  return {
    publicPageRoutes: [
      routes.marketing.home,
      routes.marketing.downloads,
      routes.marketing.blog,
      routes.marketing.newsBlogs,
      routes.marketing.contact,
      routes.marketing.whyUs,
      routes.marketing.affiliate,
      routes.marketing.privacyPolicy,
      routes.marketing.terms,
      routes.marketing.productsRoot,
      `${routes.marketing.productsRoot}/*`,
      routes.marketing.paymentMethodsRoot,
      `${routes.marketing.paymentMethodsRoot}/*`,
      routes.auth.error,
    ],
    authRoutes: [
      routes.auth.login,
      routes.auth.register,
      routes.auth.forgotPassword,
      routes.auth.passwordReset,
      routes.auth.emailVerification,
      routes.auth.otpVerification,
      routes.auth.mpinSetup,
      routes.auth.mpinVerify,
      routes.auth.sessionSecurityStepUp,
      routes.auth.phoneVerification,
      routes.auth.kyc,
    ],
    phoneVerificationRoutes: [routes.auth.phoneVerification],
    mpinRoutes: [routes.auth.mpinSetup, routes.auth.mpinVerify],
    sessionSecurityStepUpRoutes: [routes.auth.sessionSecurityStepUp],
    passwordResetRoutes: [routes.auth.forgotPassword, routes.auth.passwordReset],
    adminRouteRoots: [routes.app.adminRoot, routes.app.adminConsoleRoot],
    dashboardRoute: routes.app.dashboard,
    authKycRoute: routes.auth.kyc,
    authLoginRoute: routes.auth.login,
  }
}
