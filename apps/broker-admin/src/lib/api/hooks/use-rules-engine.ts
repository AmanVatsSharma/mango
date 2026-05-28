/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-rules-engine.ts
 * Module:      broker-admin · Rules Engine API Hook
 * Purpose:     Wires the rules-engine page to real backend APIs for rule CRUD.
 *
 * Exports:
 *   - useRulesEngine() → { rules, isLoading, error, refetch, createRule, updateRule, deleteRule, toggleRule }
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - GET /admin/rules          — list all rules
 *   - POST /admin/rules         — create a rule
 *   - PATCH /admin/rules/:id   — update a rule
 *   - DELETE /admin/rules/:id  — delete a rule
 *   - POST /admin/rules/:id/toggle — activate/deactivate a rule
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Optimistic update on toggle and delete
 *   - Falls back to empty list on error so page still renders
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';

/* ── API shape (mirrors RuleEntity) ────────────────────────────────────────── */

interface ApiRule {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  triggerEvent: string;
  conditions: any[];
  actions: any[];
  status: 'ACTIVE' | 'INACTIVE';
  priority: number;
  executionCount: number;
  lastTriggeredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateRulePayload {
  name: string;
  description?: string;
  triggerEvent: string;
  conditions: { field: string; op: string; value: string | number }[];
  actions: { type: string; params?: Record<string, string | number> }[];
  priority?: number;
}

interface UpdateRulePayload {
  name?: string;
  description?: string;
  triggerEvent?: string;
  conditions?: { field: string; op: string; value: string | number }[];
  actions?: { type: string; params?: Record<string, string | number> }[];
  enabled?: boolean;
  priority?: number;
}

/* ── Type mapping ──────────────────────────────────────────────────────────── */

interface FrontendRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  conditions: { field: string; op: string; value: string | number }[];
  actions: { type: string; params: Record<string, string | number> }[];
  enabled: boolean;
  executionCount: number;
  lastTriggered?: string;
}

function mapApiToRule(r: ApiRule): FrontendRule {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    trigger: r.triggerEvent,
    conditions: r.conditions ?? [],
    actions: r.actions ?? [],
    enabled: r.status === 'ACTIVE',
    executionCount: r.executionCount,
    lastTriggered: r.lastTriggeredAt
      ? new Date(r.lastTriggeredAt).toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : undefined,
  };
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

interface RulesEngineResult {
  rules: FrontendRule[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createRule: (payload: CreateRulePayload) => Promise<void>;
  updateRule: (id: string, payload: UpdateRulePayload) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  toggleRule: (id: string) => Promise<void>;
}

export function useRulesEngine(): RulesEngineResult {
  const [rules, setRules] = useState<FrontendRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<ApiRule[]>('/admin/rules')
      .then(res => {
        if (!cancelled) setRules(res.map(mapApiToRule));
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load rules');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  const createRule = useCallback(async (payload: CreateRulePayload) => {
    await apiRequest<ApiRule>('/admin/rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    refetch();
  }, [refetch]);

  const updateRule = useCallback(async (id: string, payload: UpdateRulePayload) => {
    await apiRequest<ApiRule>(`/admin/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    refetch();
  }, [refetch]);

  const deleteRule = useCallback(async (id: string) => {
    await apiRequest(`/admin/rules/${id}`, { method: 'DELETE' });
    setRules(prev => prev.filter(r => r.id !== id));
  }, []);

  const toggleRule = useCallback(async (id: string) => {
    // Optimistic: flip enabled locally
    setRules(prev =>
      prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r),
    );
    try {
      await apiRequest<ApiRule>(`/admin/rules/${id}/toggle`, { method: 'POST' });
    } catch {
      refetch(); // revert on failure
    }
  }, [refetch]);

  return { rules, isLoading, error, refetch, createRule, updateRule, deleteRule, toggleRule };
}
