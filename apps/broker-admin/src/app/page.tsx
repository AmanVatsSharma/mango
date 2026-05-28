/**
 * File:        apps/broker-admin/src/app/page.tsx
 * Module:      broker-admin · Root Page
 * Purpose:     Redirect root URL to /dashboard
 *
 * Side-effects:
 *   - none (redirect only)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/dashboard');
}
