/**
 * File:        app/(admin)/layout.tsx
 * Module:      App · (admin) route group
 * Purpose:     Wraps the admin route group (/admin-console/* and /admin/*) in the
 *              authenticated provider stack (SessionProvider + ApolloProviderWrapper).
 *              These were previously inherited from the root layout; root no longer
 *              provides them so marketing pages stay light.
 *
 * Exports:
 *   - default AdminGroupLayout({ children })
 *
 * Depends on:
 *   - @/components/providers/AuthedAppProviders
 *
 * Side-effects: SessionProvider polls /api/auth/session per next-auth defaults
 *
 * Key invariants:
 *   - admin-console/layout.tsx still wraps with AdminSessionProvider for its own
 *     /api/me-driven RBAC view of the user; this layout only ensures the underlying
 *     NextAuth session and Apollo contexts are present for any descendant that needs them.
 *
 * Read order:
 *   1. AdminGroupLayout — sole export
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import type { ReactNode } from "react"
import { AuthedAppProviders } from "@/components/providers/AuthedAppProviders"

export default function AdminGroupLayout({ children }: { children: ReactNode }) {
  return <AuthedAppProviders>{children}</AuthedAppProviders>
}
