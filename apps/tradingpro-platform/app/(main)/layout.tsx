/**
 * File:        app/(main)/layout.tsx
 * Module:      App · (main) route group
 * Purpose:     Wraps authenticated user-facing routes (dashboard, auth flows, market-demo,
 *              test pages) in SessionProvider + ApolloProviderWrapper. These are no longer
 *              in the root layout so marketing pages (/, /products, /contact, etc.) skip
 *              the cost.
 *
 * Exports:
 *   - default MainGroupLayout({ children })
 *
 * Depends on:
 *   - @/components/providers/AuthedAppProviders — bundled SessionProvider + ApolloProvider
 *
 * Side-effects: SessionProvider polls /api/auth/session per next-auth defaults
 *
 * Key invariants: none
 *
 * Read order:
 *   1. MainGroupLayout — sole export
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import type { ReactNode } from "react"
import { AuthedAppProviders } from "@/components/providers/AuthedAppProviders"

export default function MainGroupLayout({ children }: { children: ReactNode }) {
  return <AuthedAppProviders>{children}</AuthedAppProviders>
}
