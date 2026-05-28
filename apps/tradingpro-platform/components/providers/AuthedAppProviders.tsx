/**
 * File:        components/providers/AuthedAppProviders.tsx
 * Module:      Providers · Authenticated app shell
 * Purpose:     Bundles the providers that authenticated routes need but that marketing
 *              pages do not. Mounted in (main), (console), (admin) route-group layouts so
 *              public pages (/, /products, /contact, /privacy-policy, /terms, etc.) skip
 *              the @apollo/client (16 MB installed), next-auth/react SessionProvider, and
 *              the SWRConfig defaults below.
 *
 * Exports:
 *   - AuthedAppProviders({ children }) — single wrapper for SessionProvider + Apollo + SWR
 *
 * Depends on:
 *   - @/components/providers/SessionProvider — next-auth/react context
 *   - @/components/apollo-provider — apollo client context
 *   - swr.SWRConfig — global SWR defaults (dedup window, no focus revalidation)
 *
 * Side-effects: SessionProvider polls /api/auth/session per next-auth defaults
 *
 * Key invariants:
 *   - This wrapper MUST NOT be added to the root layout — that's the bug we removed in
 *     Wave 1. Marketing pages must remain free of these providers.
 *   - SWR defaults below are SAFE OVERRIDES — any per-hook config still wins. They exist
 *     to catch hooks that forgot to set revalidateOnFocus:false (the noisiest default).
 *
 * Read order:
 *   1. SWR_DEFAULTS — the global override
 *   2. AuthedAppProviders — wrap chain
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

"use client"

import type { ReactNode } from "react"
import { SWRConfig } from "swr"
import SessionProvider from "@/components/providers/SessionProvider"
import ApolloProviderWrapper from "@/components/apollo-provider"

/**
 * Per-hook SWR options always override these. Defaults exist for hooks that didn't
 * explicitly set them — most importantly revalidateOnFocus, which by SWR's default
 * fires a refetch every time the user tabs back to the browser. On the trading
 * dashboard that means a thundering refetch when a user comes back from another tab.
 */
const SWR_DEFAULTS = {
  dedupingInterval: 2000,
  revalidateOnFocus: false,
  focusThrottleInterval: 5000,
  shouldRetryOnError: true,
  errorRetryInterval: 5000,
  errorRetryCount: 3,
} as const

export function AuthedAppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ApolloProviderWrapper>
        <SWRConfig value={SWR_DEFAULTS}>{children}</SWRConfig>
      </ApolloProviderWrapper>
    </SessionProvider>
  )
}
