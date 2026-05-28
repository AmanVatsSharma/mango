/**
 * File:        app/admin-console/risk/audit/page.tsx
 * Module:      Admin Console · Risk Management · Audit History
 * Purpose:     Server component entry point for the Risk Audit History page —
 *              renders the AuditHistoryTab client component.
 *
 * Exports:
 *   - RiskAuditPage  — default export, Next.js page server component
 *
 * Depends on:
 *   - @/components/admin-console/risk-management/audit-history-tab — client component
 *
 * Side-effects:
 *   - none (server component delegates all rendering to client component)
 *
 * Key invariants:
 *   - Full audit history table UI is implemented in Change G
 *
 * Read order:
 *   1. RiskAuditPage — single render delegation
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { AuditHistoryTab } from "@/components/admin-console/risk-management/audit-history-tab"

export default function RiskAuditPage() {
  return <AuditHistoryTab />
}
