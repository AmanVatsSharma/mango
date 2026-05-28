/**
 * @file Branding/identity.ts
 * @module Branding
 * @description Single source of truth for brand identity strings, emails, URLs, and metadata.
 * @author MarketPulse360
 * @created 2026-02-20
 */

export interface BrandIdentity {
  names: {
    full: string
    short: string
    slug: string
  }
  legal: {
    companyName: string
    copyrightYear: number
  }
  messaging: {
    tagline: string
    shortTagline: string
    heroBadgeLabel: string
  }
  meta: {
    appTitle: string
    appDescription: string
  }
  email: {
    support: string
    onboarding: string
    noreplyDefault: string
  }
  urls: {
    productionBaseUrl: string
    domain: string
  }
  sms: {
    senderId: string
    otpSignature: string
  }
  routes: BrandRouteConfig
}

export interface BrandRouteTemplateGroups {
  marketing: {
    home: string
    blog: string
    newsBlogs: string
    contact: string
    whyUs: string
    affiliate: string
    privacyPolicy: string
    terms: string
    downloads: string
    productsRoot: string
    productsCfdInstrument: string
    productsIndexes: string
    productsStocks: string
    productsCommodity: string
    paymentMethodsRoot: string
    paymentBankTransfer: string
    paymentUpiTransfer: string
    paymentCashPayment: string
    paymentCryptoUsdtTrc20: string
  }
  auth: {
    root: string
    error: string
    login: string
    register: string
    forgotPassword: string
    passwordReset: string
    emailVerification: string
    otpVerification: string
    mpinSetup: string
    mpinVerify: string
    sessionSecurityStepUp: string
    phoneVerification: string
    kyc: string
  }
  app: {
    dashboard: string
    adminRoot: string
    adminKyc: string
    adminConsoleRoot: string
    adminConsoleAccessControl: string
    adminConsoleAdvanced: string
    adminConsoleAnalytics: string
    adminConsoleAudit: string
    adminConsoleCleanup: string
    adminConsoleFinancialOverview: string
    adminConsoleFinancialReports: string
    adminConsoleFunds: string
    adminConsoleKyc: string
    adminConsoleLogs: string
    adminConsoleNotifications: string
    adminConsoleOrders: string
    adminConsolePositions: string
    adminConsoleMarketData: string
    adminConsoleRisk: string
    adminConsoleRms: string
    adminConsoleSettings: string
    adminConsoleSystemHealth: string
    adminConsoleUsers: string
    adminConsoleWorkers: string
    consoleRoot: string
  }
}

export interface BrandRouteConfig {
  brandSlug: string
  legacyBrandSlugs: string[]
  templates: BrandRouteTemplateGroups
}

function normalizeBrandSlug(slug: string): string {
  const normalized = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return normalized || "brand"
}

function buildDefaultRouteTemplates(): BrandRouteTemplateGroups {
  return {
    marketing: {
      home: "/",
      blog: "/blog",
      newsBlogs: "/news-blogs",
      contact: "/contact",
      whyUs: "/why-{brandSlug}",
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
      adminConsoleMarketData: "/admin-console/market-data",
      adminConsoleRisk: "/admin-console/risk",
      adminConsoleRms: "/admin-console/rms",
      adminConsoleSettings: "/admin-console/settings",
      adminConsoleSystemHealth: "/admin-console/system-health",
      adminConsoleUsers: "/admin-console/users",
      adminConsoleWorkers: "/admin-console/workers",
      consoleRoot: "/console",
    },
  }
}

export const BRAND_IDENTITY: BrandIdentity = {
  names: {
    full: "MarketPulse360",
    short: "MP360",
    slug: "marketpulse-360",
  },
  legal: {
    companyName: "MarketPulse360",
    copyrightYear: 2026,
  },
  messaging: {
    tagline: "Trade Smart. Trade Fast. Trade Stock.",
    shortTagline: "Your Portfolio, Your Control.",
    heroBadgeLabel: "Next-Gen Trading Platform",
  },
  meta: {
    appTitle: "MarketPulse360 - Trading Platform",
    appDescription: "Trade Smart. Trade Fast. Trade Stock. Advanced trading platform with real-time market data.",
  },
  email: {
    support: "support@marketpulse360.live",
    onboarding: "onboarding@marketpulse360.live",
    noreplyDefault: "noreply@marketpulse360.live",
  },
  urls: {
    productionBaseUrl: "https://www.marketpulse360.live",
    domain: "marketpulse360.live",
  },
  sms: {
    senderId: "Mp360",
    otpSignature: "MarketPulse360",
  },
  routes: {
    brandSlug: normalizeBrandSlug("marketpulse-360"),
    legacyBrandSlugs: ["stocktrade", "tradebazaar", "marketpulse"],
    templates: buildDefaultRouteTemplates(),
  },
}
