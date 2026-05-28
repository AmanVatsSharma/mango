/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-deployment.ts
 * Module:      broker-admin · Admin · Deployment Management
 * Purpose:     Wires the deployment dashboard to the backend's /admin/deployment/*
 *              endpoints. Returns current health, version, and deploy history,
 *              and exposes a trigger for new deployments.
 *
 * Exports:
 *   - DeploymentStatus      — live deployment state (URL, version, health, status)
 *   - DeployHistoryEntry   — one row in the deploy log
 *   - useDeployment()      — { status, history, isLoading, isDeploying, error,
 *                             triggerDeploy, refetch }
 *
 * Depends on:
 *   - ../client — apiRequest (GET /admin/deployment/status,
 *                               POST /admin/deployment/deploy,
 *                               GET /admin/deployment/history,
 *                               GET /admin/deployment/logs)
 *
 * Side-effects:
 *   - Calls GET /admin/deployment/status on mount
 *   - Calls GET /admin/deployment/history on mount
 *   - Calls POST /admin/deployment/deploy on triggerDeploy
 *   - Calls GET /admin/deployment/logs when viewing a specific log
 *
 * Key invariants:
 *   - 'use client' — only uses browser APIs via apiRequest
 *   - triggerDeploy() does not await completion; polling is the caller's responsibility
 *   - Polling should be done via repeated refetch() calls (no auto-poll inside hook)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface DeploymentHealth {
  api: boolean;
  db: boolean;
  redis: boolean;
  ws: boolean;
  graphql: boolean;
}

export interface DeploymentStatus {
  webAppUrl: string;
  version: string;
  lastDeployed: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'DEPLOYING';
  health: DeploymentHealth;
}

export interface DeployHistoryEntry {
  id: string;
  version: string;
  timestamp: string;
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
  triggeredBy: string;
  durationMs?: number;
  commitSha?: string;
}

export interface TriggerDeployRequest {
  version: string;
}

/* ── State shape ────────────────────────────────────────────────────────────── */

interface DeploymentState {
  status: DeploymentStatus | null;
  history: DeployHistoryEntry[];
  isLoading: boolean;
  isDeploying: boolean;
  error: string | null;
}

/* ── Hook ──────────────────────────────────────────────────────────────────── */

export function useDeployment() {
  const [state, setState] = useState<DeploymentState>({
    status: null,
    history: [],
    isLoading: true,
    isDeploying: false,
    error: null,
  });

  const setError = (msg: string) => setState(s => ({ ...s, error: msg }));
  const clearError = () => setState(s => ({ ...s, error: null }));

  /* fetch status */
  const refetch = useCallback(async () => {
    clearError();
    setState(s => ({ ...s, isLoading: true }));
    try {
      const [status, history] = await Promise.all([
        apiRequest<DeploymentStatus>('/admin/deployment/status'),
        apiRequest<DeployHistoryEntry[]>('/admin/deployment/history'),
      ]);
      setState(s => ({ ...s, status, history: history ?? [], isLoading: false }));
    } catch (err) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load deployment info',
      }));
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  /* trigger deploy */
  const triggerDeploy = useCallback(async (version: string): Promise<boolean> => {
    clearError();
    setState(s => ({ ...s, isDeploying: true }));
    try {
      await apiRequest('/admin/deployment/deploy', {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
      setState(s => ({ ...s, isDeploying: false }));
      return true;
    } catch (err) {
      setState(s => ({
        ...s,
        isDeploying: false,
        error: err instanceof Error ? err.message : 'Failed to trigger deployment',
      }));
      return false;
    }
  }, []);

  return {
    status: state.status,
    history: state.history,
    isLoading: state.isLoading,
    isDeploying: state.isDeploying,
    error: state.error,
    refetch,
    triggerDeploy,
  };
}