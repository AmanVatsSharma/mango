/**
 * @file app/(admin-v2)/admin-v2/clients/[userId]/page.tsx
 * @module admin-v2
 * @description Canonical full-page Client 360 route — deep-linkable per ?tab=…  The drawer
 *              presentation (opened from the clients list) shares the same Client360 component.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { Client360 } from "@/components/admin-v2/client-360/client-360"

export const dynamic = "force-dynamic"

export default function AdminV2ClientRoute({ params }: { params: { userId: string } }) {
  return <Client360 userId={params.userId} mode="page" />
}
