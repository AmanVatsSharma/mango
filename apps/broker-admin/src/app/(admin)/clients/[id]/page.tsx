/**
 * File:        apps/broker-admin/src/app/(admin)/clients/[id]/page.tsx
 * Module:      broker-admin · Client Detail
 * Purpose:     Client detail route — redirects to /clients since the drawer opens inline on the
 *              clients list page; this route exists for deep-link compatibility
 *
 * Side-effects:
 *   - Server-side redirect to /clients
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { redirect } from 'next/navigation';

// Enumerate all mock client IDs so static export can pre-render deep-link fallbacks
export function generateStaticParams() {
  const ids = ['C1001','C1002','C1003','C1004','C1005','C1006','C1007',
                'C1008','C1009','C1010','C1011','C1012','C1013','C1014',
                'C1015','C1016','C1017','C1018','C1019','C1020'];
  return ids.map(id => ({ id }));
}

export default function ClientDetailPage() {
  redirect('/clients');
}
