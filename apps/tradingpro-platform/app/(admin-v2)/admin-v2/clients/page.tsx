/**
 * @file app/(admin-v2)/admin-v2/clients/page.tsx
 * @module admin-v2
 * @description Clients list route. Thin server-component wrapper; the rich UI is the client
 *              component ClientsListPage. Auth + allowlist gating happens in the parent layout.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import ClientsListPage from "@/components/admin-v2/clients/clients-list"

export const dynamic = "force-dynamic"

export default function AdminV2ClientsRoute() {
  return <ClientsListPage />
}
