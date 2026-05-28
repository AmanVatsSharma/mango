/**
 * File:        apps/broker-admin/src/lib/auth/auth-guard.tsx
 * Module:      broker-admin · Auth Guard
 * Purpose:     Client-side redirect guard. Wraps the (admin) layout to redirect
 *              unauthenticated users to /login. Returns null during hydration to
 *              prevent SSR/sessionStorage mismatch.
 *
 * Exports:
 *   - AuthGuard({ children }) — client component; redirects or renders children
 *
 * Depends on:
 *   - ./auth-context — useAuth()
 *
 * Side-effects:
 *   - Calls router.replace('/login') on first render if not authenticated
 *
 * Key invariants:
 *   - 'use client' — requires useEffect for sessionStorage hydration timing
 *   - Returns null until hydrated to prevent flash of authenticated content
 *   - /login itself must NOT be wrapped in this guard
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './auth-context';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && !isAuthenticated && pathname !== '/login') {
      router.replace('/login');
    }
  }, [hydrated, isAuthenticated, pathname, router]);

  if (!hydrated) return null;
  if (!isAuthenticated && pathname !== '/login') return null;

  return <>{children}</>;
}
