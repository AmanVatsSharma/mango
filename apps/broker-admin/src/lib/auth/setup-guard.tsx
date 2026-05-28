/**
 * File:        apps/broker-admin/src/lib/auth/setup-guard.tsx
 * Module:      broker-admin · Setup Guard
 * Purpose:     Client-side guard that checks whether the current tenant has completed
 *              onboarding setup. If the tenant status is PENDING (not yet activated by
 *              the broker admin), redirect to /setup so they can configure their
 *              brokerage before accessing any dashboard pages.
 *
 * Exports:
 *   - SetupGuard({ children }) — client component; redirects to /setup or renders children
 *
 * Depends on:
 *   - ./auth-context — useAuth()
 *   - ../api/hooks/use-broker-setup — useSetupStatus()
 *
 * Side-effects:
 *   - Calls GET /broker-setup/status on mount
 *   - Redirects to /setup if tenant is PENDING or setup is incomplete
 *
 * Key invariants:
 *   - 'use client' — requires API call and router
 *   - Returns null during loading/error states to prevent premature redirect
 *   - /setup route itself is excluded (no redirect loop)
 *   - /login route is excluded (handled separately by AuthGuard)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-11
 */

'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './auth-context';
import { useSetupStatus } from '../api/hooks/use-broker-setup';

export function SetupGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { status, isLoading } = useSetupStatus();
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || isLoading) return;
    // Skip if not yet authenticated or on setup/login pages
    if (!isAuthenticated) return;
    if (pathname === '/setup' || pathname === '/login') return;

    if (status && !status.setupComplete) {
      router.replace('/setup');
    } else if (status && status.status === 'ACTIVE') {
      // Already active — all good, render children normally
    }
  }, [ready, isLoading, isAuthenticated, pathname, router, status]);

  // Loading or not yet ready — show nothing to prevent flash
  if (!ready || isLoading) return null;

  // Not authenticated — let AuthGuard handle it
  if (!isAuthenticated) return null;

  // On setup page or setup is complete — render children
  if (pathname === '/setup' || (status && status.setupComplete)) return <>{children}</>;

  // PENDING and not on setup page — SetupGuard handles the redirect above
  return null;
}