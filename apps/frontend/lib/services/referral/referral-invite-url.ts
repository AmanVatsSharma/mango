/**
 * @file referral-invite-url.ts
 * @module lib/services/referral
 * @description Build absolute signup links with ?ref= for sharing (uses public base URL + branding register path).
 * @author StockTrade
 * @created 2026-04-01
 */

import { getAuthRoute } from "@/lib/branding-routes"

/**
 * Returns signup URL with ref query (clientId or custom code). Base URL from NEXT_PUBLIC_APP_URL or VERCEL_URL.
 */
export function buildReferralSignupUrl(refCode: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  const path = getAuthRoute("register")
  const u = new URL(path, base || "http://localhost:3000")
  u.searchParams.set("ref", refCode)
  return u.toString()
}
