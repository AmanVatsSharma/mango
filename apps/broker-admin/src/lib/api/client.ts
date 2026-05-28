/**
 * File:        apps/broker-admin/src/lib/api/client.ts
 * Module:      broker-admin · API Client
 * Purpose:     Thin fetch wrapper for the Obsidian backend. Reads the broker JWT
 *              from sessionStorage, attaches Authorization + x-tenant-id headers,
 *              and surfaces typed errors from the backend's error envelope.
 *
 * Exports:
 *   - ApiError                      — typed error with code, requestId, status
 *   - apiRequest<T>(path, init)     — authenticated fetch; throws ApiError on non-2xx
 *
 * Depends on:
 *   - next.config.js /api/* rewrite  — proxies /api/:path* → localhost:3000/:path*
 *
 * Side-effects:
 *   - Reads 'ba_access_token' and 'ba_tenant_code' from sessionStorage
 *
 * Key invariants:
 *   - path must NOT include /api prefix — it is added internally
 *   - sessionStorage is undefined during SSR; guarded by typeof window check
 *   - x-tenant-id must match the JWT tid claim — enforced by TenantGuard on backend
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('ba_access_token') : null;
  const tenantCode = typeof window !== 'undefined' ? sessionStorage.getItem('ba_tenant_code') : null;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };

  if (token) headers['authorization'] = `Bearer ${token}`;
  if (tenantCode) headers['x-tenant-id'] = tenantCode;

  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = `HTTP ${res.status}`;
    let requestId: string | undefined;
    try {
      const body = await res.json();
      code = body.code ?? code;
      message = body.message ?? message;
      requestId = body.requestId;
    } catch { /* non-JSON body */ }
    throw new ApiError(message, code, requestId, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}
