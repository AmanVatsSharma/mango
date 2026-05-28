/**
 * File:        apps/broker-admin/src/lib/tenant/tenant-context.tsx
 * Module:      broker-admin · Tenant Context
 * Purpose:     Resolves the current broker's tenant code from the hostname (subdomain)
 *              and provides it to the app via React context. Falls back to
 *              NEXT_PUBLIC_DEFAULT_TENANT for local dev without a subdomain.
 *
 * Exports:
 *   - TenantProvider({ children }) — wraps the app, resolves and stores tenantCode
 *   - useTenant()                  — returns { tenantCode: string }
 *
 * Side-effects:
 *   - Writes 'ba_tenant_code' to sessionStorage after hydration
 *
 * Key invariants:
 *   - 'use client' — reads window.location.hostname
 *   - Subdomain extraction: "acme-securities.localhost" → "acme-securities"
 *   - On plain "localhost" (no subdomain), falls back to NEXT_PUBLIC_DEFAULT_TENANT
 *   - SSR: returns empty string during server render; hydration replaces it via useEffect
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface TenantContextValue {
  tenantCode: string;
}

const TenantContext = createContext<TenantContextValue | null>(null);

function resolveTenantFromHostname(): string {
  if (typeof window === 'undefined') return '';
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  // "acme-securities.localhost" → ["acme-securities", "localhost"] → "acme-securities"
  // "acme.obsidian.io" → ["acme", "obsidian", "io"] → "acme"
  // "localhost" → ["localhost"] → fallback
  if (parts.length >= 2 && parts[0] !== 'www') {
    return parts[0];
  }
  return process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? '';
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantCode, setTenantCode] = useState<string>('');

  useEffect(() => {
    const resolved = resolveTenantFromHostname();
    if (resolved) {
      setTenantCode(resolved);
      sessionStorage.setItem('ba_tenant_code', resolved);
    }
  }, []);

  return (
    <TenantContext.Provider value={{ tenantCode }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>');
  return ctx;
}
