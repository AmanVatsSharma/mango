/**
 * File:        app/(admin)/admin-console/layout.tsx
 * Module:      Admin Console · Server layout
 * Purpose:     Server layout for /admin-console/*. Wraps children in the admin RBAC
 *              session provider plus the interactive shell (sidebar / header / FAB).
 *              The interactive state and framer-motion live in <AdminConsoleShell>
 *              (client) so this layout itself is a pure server component — no
 *              "use client" directive at the layout level.
 *
 * Exports:
 *   - default AdminConsoleLayout({ children })
 *
 * Depends on:
 *   - @/components/admin-console/admin-session-provider — /api/me-driven RBAC
 *   - @/components/admin-console/admin-console-shell — interactive chrome (client)
 *
 * Side-effects: none at the layout level
 *
 * Key invariants:
 *   - DO NOT add "use client" here. Server-component layouts allow children to be
 *     server-rendered through the client shell as React's "children as slot" pattern.
 *
 * Read order:
 *   1. AdminConsoleLayout — sole export
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import { Suspense } from "react"
import { AdminSessionProvider } from "@/components/admin-console/admin-session-provider"
import { AdminConsoleShell } from "@/components/admin-console/admin-console-shell"

export default function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminSessionProvider>
        <AdminConsoleShell>{children}</AdminConsoleShell>
      </AdminSessionProvider>
    </Suspense>
  )
}
