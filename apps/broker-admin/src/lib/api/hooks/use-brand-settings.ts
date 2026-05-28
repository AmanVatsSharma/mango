/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-brand-settings.ts
 * Module:      broker-admin · Brand Settings API Hook
 * Purpose:     Fetches the current tenant's brand config on mount (from GET /tenancy/brand-config
 *              which is a public endpoint), and exposes an upsertBrandConfig() mutation
 *              for the brand-settings page. Handles save/reset with optimistic feedback.
 *
 * Exports:
 *   - BrandConfig     — shape matching TenantBrandConfigEntity from backend
 *   - useBrandSettings() — { config, upsert, isLoading, isSaving, error }
 *
 * Depends on:
 *   - ../client — apiRequest (GET /tenancy/brand-config, POST /broker-setup/brand-config)
 *
 * Side-effects:
 *   - Calls GET /tenancy/brand-config?slug=<current tenant> on mount (public — no auth needed)
 *   - Calls POST /broker-setup/brand-config on save (requires auth)
 *
 * Key invariants:
 *   - 'use client' — only uses browser APIs via apiRequest
 *   - config is null until the API responds; page shows defaults while loading
 *   - upsert() sends the full form back to the backend; partial saves are safe
 *   - brand-config GET is public so it works on the login page too (no auth required)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-20
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';
import { useTenant } from '../../tenant/tenant-context';

export interface BrandConfig {
  appName: string;
  tagline: string;
  primaryColor: string;
  logoUrl: string;
  faviconUrl: string;
  supportEmail: string;
  supportPhone: string;
  customDomain: string;
}

interface BrandSettingsResult {
  config: BrandConfig | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  upsert: (data: BrandConfig) => Promise<boolean>;
  refetch: () => void;
}

const DEFAULTS: BrandConfig = {
  appName: '',
  tagline: '',
  primaryColor: '#3B82F6',
  logoUrl: '',
  faviconUrl: '',
  supportEmail: '',
  supportPhone: '',
  customDomain: '',
};

export function useBrandSettings(): BrandSettingsResult {
  const { tenantCode } = useTenant();
  const [config, setConfig] = useState<BrandConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!tenantCode) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // /tenancy/brand-config is a public endpoint — resolves by slug only
    apiRequest('/tenancy/brand-config?slug=' + encodeURIComponent(tenantCode))
      .then((raw: unknown) => {
        if (cancelled) return;
        const brandConfig = raw as Partial<BrandConfig> | null;
        if (brandConfig) {
          setConfig({
            appName:       brandConfig.appName ?? '',
            tagline:       brandConfig.tagline ?? '',
            primaryColor:  brandConfig.primaryColor ?? '#3B82F6',
            logoUrl:       brandConfig.logoUrl ?? '',
            faviconUrl:    brandConfig.faviconUrl ?? '',
            supportEmail:  brandConfig.supportEmail ?? '',
            supportPhone:  brandConfig.supportPhone ?? '',
            customDomain:  brandConfig.customDomain ?? '',
          });
        } else {
          setConfig(DEFAULTS);
        }
      })
      .catch(() => {
        if (!cancelled) setConfig(DEFAULTS);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [tenantCode, tick]);

  const upsert = useCallback(async (data: BrandConfig): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    try {
      await apiRequest('/broker-setup/brand-config', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setConfig(data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save brand config');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { config, isLoading, isSaving, error, upsert, refetch };
}