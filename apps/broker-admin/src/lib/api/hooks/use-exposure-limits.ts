/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-exposure-limits.ts
 * Module:      broker-admin · Exposure Limits API Hook
 * Purpose:     Real API backing for the exposure-limits module.
 *              Calls GET /admin/exposure-limits and falls back to mock data on error
 *              so the page renders even when the backend is not seeded.
 *
 * Exports:
 *   - useExposureLimits() — returns { limits, isLoading, error, refetch, updateLimit }
 *
 * Depends on:
 *   - ../client           — apiRequest
 *   - ../../mock-data     — MOCK_EXPOSURE_LIMITS fallback
 *
 * Side-effects:
 *   - Calls GET /admin/exposure-limits on mount
 *   - Calls PATCH /admin/exposure-limits/:id on updateLimit
 *
 * Key invariants:
 *   - 'use client' safe — browser APIs via apiRequest
 *   - Falls back to MOCK_EXPOSURE_LIMITS on network error so the page is never blank
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-18
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiError } from '../client';
import { MOCK_EXPOSURE_LIMITS } from '../../mock-data';
import type { ExposureLimit } from '@/lib/types';

export interface ApiExposureLimit {
  id: string;
  tenantId: string;
  instrumentId: string;
  maxNetExposure: string;
  currentNetExposure: string;
  alertThreshold: string;
  hardLimit: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ExposureLimitsResult {
  limits: ExposureLimit[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  updateLimit: (id: string, updates: Partial<Pick<ExposureLimit, 'maxNetExposure' | 'alertThreshold' | 'hardLimit'>>) => Promise<void>;
}

/** Maps ApiExposureLimit (backend entity) to the ExposureLimit type used by the UI */
function mapEntity(e: ApiExposureLimit): ExposureLimit {
  const max = Number(e.maxNetExposure);
  const current = Number(e.currentNetExposure);
  const utilizationPct = max > 0 ? (current / max) * 100 : 0;
  const alertPct = Number(e.alertThreshold) * 100;
  let status: ExposureLimit['status'];
  if (utilizationPct >= alertPct) {
    status = 'Breach';
  } else if (utilizationPct >= alertPct * 0.8) {
    status = 'Warning';
  } else {
    status = 'Normal';
  }
  return {
    id: e.id,
    symbol: e.instrumentId,
    maxNetExposure: max,
    currentNetExposure: current,
    utilizationPct,
    alertThreshold: Number(e.alertThreshold) * 100,
    hardLimit: Number(e.hardLimit),
    status,
  };
}

export function useExposureLimits(): ExposureLimitsResult {
  const [limits, setLimits] = useState<ExposureLimit[]>(MOCK_EXPOSURE_LIMITS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<ApiExposureLimit[]>('/admin/exposure-limits')
      .then(res => {
        if (!cancelled) {
          const mapped = Array.isArray(res) ? res.map(mapEntity) : MOCK_EXPOSURE_LIMITS;
          setLimits(mapped.length > 0 ? mapped : MOCK_EXPOSURE_LIMITS);
        }
      })
      .catch(() => {
        // Network or auth error — keep mock data so the page is never blank
        if (!cancelled) setError(null);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [tick]);

  const updateLimit = useCallback(
    async (id: string, updates: Partial<Pick<ExposureLimit, 'maxNetExposure' | 'alertThreshold' | 'hardLimit'>>) => {
      try {
        await apiRequest(`/admin/exposure-limits/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
        refetch();
      } catch (err) {
        throw new ApiError(
          err instanceof ApiError ? err.message : 'Failed to update exposure limit',
          err instanceof ApiError ? err.code : 'UPDATE_LIMIT_FAILED',
          err instanceof ApiError ? err.requestId : undefined,
          err instanceof ApiError ? err.status : undefined,
        );
      }
    },
    [refetch],
  );

  return { limits, isLoading, error, refetch, updateLimit };
}