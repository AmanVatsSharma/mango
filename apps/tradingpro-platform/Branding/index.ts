/**
 * @file Branding/index.ts
 * @module Branding
 * @description Branding exports and helpers for URLs, email links, and runtime brand values.
 * @author StockTrade
 * @created 2026-02-20
 */

import { BRAND_ASSETS } from "./assets"
import { BRAND_IDENTITY } from "./identity"
import { BRAND_MARKETING } from "./marketing"
import { BRAND_THEME } from "./theme"

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}

function normalizeBrandSlug(slug: string): string {
  const normalized = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return normalized || BRAND_IDENTITY.routes.brandSlug
}

export function getBrandSlug(): string {
  const envSlug = process.env.NEXT_PUBLIC_BRAND_SLUG || process.env.BRAND_SLUG || BRAND_IDENTITY.routes.brandSlug
  return normalizeBrandSlug(envSlug)
}

export function resolveRouteTemplate(template: string, brandSlug: string = getBrandSlug()): string {
  const resolved = template.split("{brandSlug}").join(brandSlug)
  if (!resolved.startsWith("/")) return `/${resolved}`
  return resolved
}

export function getBaseUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")

  return normalizeBaseUrl(envUrl || BRAND_IDENTITY.urls.productionBaseUrl)
}

export function buildUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${getBaseUrl()}${normalizedPath}`
}

export function buildAuthUrl(path: string): string {
  const authRoot = resolveRouteTemplate(BRAND_IDENTITY.routes.templates.auth.root)
  const normalizedPath = path.startsWith("/") ? path : `${authRoot}/${path}`
  const finalPath = normalizedPath.startsWith(`${authRoot}/`) || normalizedPath === authRoot ? normalizedPath : `${authRoot}${normalizedPath}`
  return buildUrl(finalPath)
}

export function getResolvedBrandRoutes() {
  const slug = getBrandSlug()
  return {
    marketing: Object.fromEntries(
      Object.entries(BRAND_IDENTITY.routes.templates.marketing).map(([key, value]) => [key, resolveRouteTemplate(value, slug)])
    ) as typeof BRAND_IDENTITY.routes.templates.marketing,
    auth: Object.fromEntries(
      Object.entries(BRAND_IDENTITY.routes.templates.auth).map(([key, value]) => [key, resolveRouteTemplate(value, slug)])
    ) as typeof BRAND_IDENTITY.routes.templates.auth,
    app: Object.fromEntries(
      Object.entries(BRAND_IDENTITY.routes.templates.app).map(([key, value]) => [key, resolveRouteTemplate(value, slug)])
    ) as typeof BRAND_IDENTITY.routes.templates.app,
  }
}

export function getLegacyBrandSlugs(): string[] {
  return BRAND_IDENTITY.routes.legacyBrandSlugs
    .map((slug) => normalizeBrandSlug(slug))
    .filter((slug, index, list) => slug.length > 0 && list.indexOf(slug) === index)
}

export function getAuthRootRoute(): string {
  return resolveRouteTemplate(BRAND_IDENTITY.routes.templates.auth.root)
}

export function buildRouteUrl(path: string): string {
  return buildUrl(path)
}

export function buildAssetUrl(path: string): string {
  return buildUrl(path)
}

export function getResendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || BRAND_IDENTITY.email.onboarding || BRAND_IDENTITY.email.noreplyDefault
}

export function getSmsSenderId(): string {
  return process.env.SMS_SENDER_ID || BRAND_IDENTITY.sms.senderId
}

export function mailtoSupport(subject?: string, body?: string): string {
  const params = new URLSearchParams()
  if (subject) params.set("subject", subject)
  if (body) params.set("body", body)
  const query = params.toString()
  return query ? `mailto:${BRAND_IDENTITY.email.support}?${query}` : `mailto:${BRAND_IDENTITY.email.support}`
}

export { BRAND_ASSETS, BRAND_IDENTITY, BRAND_MARKETING, BRAND_THEME }
