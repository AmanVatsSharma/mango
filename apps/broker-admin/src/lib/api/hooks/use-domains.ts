/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-domains.ts
 * Module:      broker-admin · Tenancy · Domain Management
 * Purpose:     Wires domain CRUD + DNS/SSL verification to the backend's
 *              /tenancy/domains endpoints. Used by the Domains tab and the
 *              standalone /domains page.
 *
 * Exports:
 *   - TenantDomain        — a registered tenant domain record
 *   - DomainVerification  — DNS record expected value + type
 *   - useDomains()        — { domains, isLoading, error, addDomain, removeDomain,
 *                            setPrimary, verifyDns, checkSsl }
 *
 * Depends on:
 *   - ../client — apiRequest (GET /tenancy/domains, POST /tenancy/domains,
 *                               DELETE /tenancy/domains/:id,
 *                               POST /tenancy/domains/:id/set-primary,
 *                               GET /tenancy/domains/verify/:domain,
 *                               GET /tenancy/domains/ssl/:domain)
 *
 * Side-effects:
 *   - Calls GET /tenancy/domains on mount
 *   - Calls POST /tenancy/domains on add
 *   - Calls DELETE /tenancy/domains/:id on remove
 *   - Calls POST /tenancy/domains/:id/set-primary on set-primary
 *   - Calls GET /tenancy/domains/verify/:domain on DNS check
 *   - Calls GET /tenancy/domains/ssl/:domain on SSL check
 *
 * Key invariants:
 *   - 'use client' — only uses browser APIs via apiRequest
 *   - addDomain() appends optimistically; rolls back on failure
 *   - verifyDns() / checkSsl() do not modify the domains list
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface TenantDomain {
  id: string;
  domain: string;
  isPrimary: boolean;
  isVerified: boolean;
  sslActive: boolean;
  sslExpiresAt: string | null;
  createdAt: string;
}

export interface DomainVerification {
  verified: boolean;
  recordType: 'A' | 'CNAME' | 'TXT';
  expectedValue: string;
}

export interface AddDomainRequest {
  domain: string;
}

/* ── State shape ────────────────────────────────────────────────────────────── */

interface DomainsState {
  domains: TenantDomain[];
  isLoading: boolean;
  isAdding: boolean;
  removingDomainId: string | null;
  error: string | null;
}

/* ── Hook ──────────────────────────────────────────────────────────────────── */

export function useDomains() {
  const [state, setState] = useState<DomainsState>({
    domains: [],
    isLoading: true,
    isAdding: false,
    removingDomainId: null,
    error: null,
  });

  const setError = (msg: string) => setState(s => ({ ...s, error: msg }));
  const clearError = () => setState(s => ({ ...s, error: null }));

  /* fetch list */
  const fetchDomains = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const domains = await apiRequest<TenantDomain[]>('/tenancy/domains');
      setState(s => ({ ...s, domains: domains ?? [], isLoading: false }));
    } catch (err) {
      setState(s => ({ ...s, isLoading: false, error: err instanceof Error ? err.message : 'Failed to load domains' }));
    }
  }, []);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  /* add */
  const addDomain = useCallback(async (domain: string): Promise<boolean> => {
    clearError();
    setState(s => ({ ...s, isAdding: true }));
    try {
      const created: TenantDomain = await apiRequest('/tenancy/domains', {
        method: 'POST',
        body: JSON.stringify({ domain }),
      });
      setState(s => ({ ...s, isAdding: false, domains: [...s.domains, created] }));
      return true;
    } catch (err) {
      setState(s => ({ ...s, isAdding: false, error: err instanceof Error ? err.message : 'Failed to add domain' }));
      return false;
    }
  }, []);

  /* remove */
  const removeDomain = useCallback(async (id: string): Promise<boolean> => {
    clearError();
    setState(s => ({ ...s, removingDomainId: id }));
    try {
      await apiRequest(`/tenancy/domains/${id}`, { method: 'DELETE' });
      setState(s => ({ ...s, removingDomainId: null, domains: s.domains.filter(d => d.id !== id) }));
      return true;
    } catch (err) {
      setState(s => ({ ...s, removingDomainId: null, error: err instanceof Error ? err.message : 'Failed to remove domain' }));
      return false;
    }
  }, []);

  /* set primary */
  const setPrimary = useCallback(async (id: string): Promise<boolean> => {
    clearError();
    try {
      await apiRequest(`/tenancy/domains/${id}/set-primary`, { method: 'POST' });
      setState(s => ({
        ...s,
        domains: s.domains.map(d => ({ ...d, isPrimary: d.id === id })),
      }));
      return true;
    } catch (err) {
      setState(s => ({ ...s, error: err instanceof Error ? err.message : 'Failed to set primary domain' }));
      return false;
    }
  }, []);

  /* verify DNS */
  const verifyDns = useCallback(async (domain: string): Promise<DomainVerification | null> => {
    try {
      return await apiRequest<DomainVerification>(`/tenancy/domains/verify/${encodeURIComponent(domain)}`);
    } catch {
      return null;
    }
  }, []);

  /* check SSL */
  const checkSsl = useCallback(async (domain: string): Promise<{ active: boolean; expiresAt: string | null } | null> => {
    try {
      return await apiRequest(`/tenancy/domains/ssl/${encodeURIComponent(domain)}`);
    } catch {
      return null;
    }
  }, []);

  return {
    domains: state.domains,
    isLoading: state.isLoading,
    isAdding: state.isAdding,
    removingDomainId: state.removingDomainId,
    error: state.error,
    refetch: fetchDomains,
    addDomain,
    removeDomain,
    setPrimary,
    verifyDns,
    checkSsl,
  };
}