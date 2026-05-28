/**
 * File:        app/(admin)/admin-console/system-health/page.tsx
 * Module:      Admin Console · System Health route
 * Purpose:     Server entry that lazy-loads the recharts-heavy SystemHealth component
 *              on the client. Keeps recharts out of the route's first-load bundle.
 *
 * Exports:
 *   - default SystemHealthPage()
 *
 * Depends on:
 *   - @/components/admin-console/system-health — dynamic-imported
 *   - @/components/admin-console/admin-page-skeleton
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - DO NOT static-import SystemHealth here — keep the dynamic() boundary.
 *
 * Read order:
 *   1. dynamic SystemHealth
 *   2. SystemHealthPage
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import dynamic from "next/dynamic"
import { AdminPageSkeleton } from "@/components/admin-console/admin-page-skeleton"

const SystemHealth = dynamic(
  () => import("@/components/admin-console/system-health").then((m) => ({ default: m.SystemHealth })),
  { ssr: false, loading: () => <AdminPageSkeleton /> },
)

export default function SystemHealthPage() {
  return <SystemHealth />
}
