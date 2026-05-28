/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-broker-setup.ts
 * Module:      broker-admin · Broker Setup API Hook
 * Purpose:     Wires the broker-admin setup wizard to the backend's /broker-setup/*
 *              endpoints. Handles legal entity creation, brand config, branch/desk
 *              creation, and provisioning advance for newly onboarded brokers.
 *
 * Exports:
 *   - SetupStatus       — shape returned by GET /broker-setup/status
 *   - useSetupStatus()  — returns { status, isLoading, error } for layout guard
 *   - useSetupMutations() — returns { createLegalEntity, upsertBrandConfig,
 *                       createBranch, createDesk, advance, isLoading, error }
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - Calls GET /broker-setup/status
 *   - Calls POST /broker-setup/legal-entity, /brand-config, /branch, /desk
 *   - Calls POST /broker-setup/advance (advances tenant PENDING → ACTIVE)
 *
 * Key invariants:
 *   - 'use client' — only uses browser APIs via apiRequest
 *   - advance() returns 409 if tenant already ACTIVE — caller handles redirect
 *   - Layout uses getSetupStatus() to decide /setup vs /dashboard redirect
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-11
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface SetupStatus {
  tenantId: string;       // UUID — use for subsequent writes
  tenantCode: string;     // slug — e.g. "acme-securities"
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  hasLegalEntity: boolean;
  hasBrandConfig: boolean;
  hasBranch: boolean;
  setupComplete: boolean;
}

export interface CreateLegalEntityRequest {
  legalName: string;
  registrationNumber: string;
  countryCode: string;
  type: string;
}

export interface UpsertBrandConfigRequest {
  primaryColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  appName?: string;
  tagline?: string;
  customDomain?: string;
  supportEmail?: string;
  supportPhone?: string;
  features?: Record<string, boolean>;
}

export interface CreateBranchRequest {
  branchCode: string;
  displayName: string;
  countryCode: string;
}

export interface CreateDeskRequest {
  branchId: string;
  deskCode: string;
  displayName: string;
}

/* ── useSetupStatus ─────────────────────────────────────────────────────────── */

export function useSetupStatus() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setIsLoading(true);
    setError(null);
    apiRequest<SetupStatus>('/broker-setup/status')
      .then(res => { setStatus(res); setIsLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load setup status'); setIsLoading(false); });
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { status, isLoading, error, refetch };
}

/* ── useSetupMutations ─────────────────────────────────────────────────────── */

export function useSetupMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withLoading = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setIsLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup action failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const createLegalEntity = useCallback(async (dto: CreateLegalEntityRequest) => {
    return withLoading(async () =>
      apiRequest('/broker-setup/legal-entity', {
        method: 'POST',
        body: JSON.stringify(dto),
      })
    );
  }, []);

  const upsertBrandConfig = useCallback(async (dto: UpsertBrandConfigRequest) => {
    return withLoading(async () =>
      apiRequest('/broker-setup/brand-config', {
        method: 'POST',
        body: JSON.stringify(dto),
      })
    );
  }, []);

  const createBranch = useCallback(async (dto: CreateBranchRequest & { brokerId?: string }) => {
    return withLoading(async () =>
      apiRequest('/broker-setup/branch', {
        method: 'POST',
        body: JSON.stringify(dto),
      })
    );
  }, []);

  const createDesk = useCallback(async (dto: CreateDeskRequest) => {
    return withLoading(async () =>
      apiRequest('/broker-setup/desk', {
        method: 'POST',
        body: JSON.stringify(dto),
      })
    );
  }, []);

  /** Advance tenant from PENDING → ACTIVE. Returns 409 if already ACTIVE. */
  const advance = useCallback(async (): Promise<{ success: boolean; alreadyActive: boolean }> => {
    return withLoading(async () => {
      try {
        await apiRequest('/broker-setup/advance', { method: 'POST' });
        return { success: true, alreadyActive: false };
      } catch (err) {
        // 409 means already active — treat as success
        if (err && typeof err === 'object' && 'status' in err && (err as { status?: number }).status === 409) {
          return { success: true, alreadyActive: true };
        }
        throw err;
      }
    }) as Promise<{ success: boolean; alreadyActive: boolean }>;
  }, []);

  return { createLegalEntity, upsertBrandConfig, createBranch, createDesk, advance, isLoading, error };
}