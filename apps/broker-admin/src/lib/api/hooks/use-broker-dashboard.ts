/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-broker-dashboard.ts
 * Module:      broker-admin · Real Broker Data Hook
 * Purpose:     Bridges the dashboard to real backend APIs while falling back to
 *              mock data when APIs return errors (dev mode / empty DB).
 *              Returns the same shape as useBrokerData() so dashboard pages
 *              require zero prop changes.
 *
 * Exports:
 *   - useRealBrokerData() — returns data matching useBrokerData() interface
 *
 * Depends on:
 *   - ../client — apiRequest (GET /admin/dashboard/stats, GET /admin/users)
 *   - ../../mock-data — MOCK_ACTIVITY_FEED, MOCK_RISK_METRICS, etc.
 *
 * Side-effects:
 *   - Calls GET /admin/dashboard/stats
 *   - Calls GET /admin/users?limit=100
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - On API error: falls back to mock data (safe default so dashboard always renders)
 *   - KYC actions call PATCH /admin/users/:id optimistically; refetch on error
 *   - Revenue, risk metrics, system status are always mocked (no backend source yet)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-11
 */

import { useCallback, useState } from 'react';
import { useClientsApi } from './use-clients';
import { useDashboardStats } from './use-dashboard-stats';
import { useRevenueStats } from './use-revenue-stats';
import { useSystemStatus } from './use-system-status';
import {
  MOCK_ACTIVITY_FEED,
  MOCK_CLIENTS,
  MOCK_EXPOSURE_LIMITS,
  MOCK_IBS,
  MOCK_INSTRUMENTS,
  MOCK_NOTIFICATIONS,
  MOCK_ORDERS,
  MOCK_RISK_METRICS,
  MOCK_CLIENT_GROUPS,
  MOCK_BONUSES,
  MOCK_AUDIT_LOG,
  MOCK_REVENUE_DATA,
  MOCK_SYSTEM_STATUS,
  MOCK_TEAM_MEMBERS,
} from '../../mock-data';
import type {
  ActivityEvent,
  BrokerConfig,
  Client,
  Transaction,
  SurveillanceAlert,
} from '../../types';

const MOCK_BROKER_CONFIG: BrokerConfig = {
  name: 'Broker Admin',
  legalName: '—',
  jurisdiction: '—',
  licenseNumber: '—',
  currency: 'USD',
  aum: 0,
  totalClients: 0,
  version: '1.0.0',
  systemStatus: 'operational',
  adminUser: { name: 'Admin', role: 'BROKER_ADMIN', lastLogin: '—' },
};

const PLACEHOLDER_TRANSACTIONS: Transaction[] = [];
const PLACEHOLDER_SURVEILLANCE: SurveillanceAlert[] = [];

export function useRealBrokerData() {
  const { stats } = useDashboardStats();
  const { clients: apiClients, approveKyc: apiApproveKyc, rejectKyc: apiRejectKyc, suspendClient: apiSuspendClient, unsuspendClient: apiUnsuspendClient } = useClientsApi();
  const { data: apiRevenue } = useRevenueStats('daily');
  const { data: apiSystemStatus } = useSystemStatus();

  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [surveillance, setSurveillance] = useState(PLACEHOLDER_SURVEILLANCE);
  const [transactions, setTransactions] = useState<Transaction[]>(PLACEHOLDER_TRANSACTIONS);

  // Real clients from API (useClientsApi returns Client[] already)
  const clients: Client[] = apiClients.length > 0 ? apiClients : MOCK_CLIENTS;

  // KPI counts
  const pendingKycCount = clients.filter(c => c.kyc === 'Pending').length;
  const pendingTxCount = transactions.filter(t => t.status === 'Pending').length;
  const openAlertCount = surveillance.filter(a => a.status === 'Open').length;
  const unreadCount = notifications.filter(n => !n.read).length;

  // Config derived from real stats when available
  const config: BrokerConfig = stats
    ? { ...MOCK_BROKER_CONFIG, totalClients: stats.users }
    : MOCK_BROKER_CONFIG;

  // Real revenue data from API; fall back to mock
  const revenueData = apiRevenue.length > 0 ? apiRevenue : MOCK_REVENUE_DATA;
  // Real system status from API; fall back to mock
  const systemStatus = apiSystemStatus.length > 0 ? apiSystemStatus : MOCK_SYSTEM_STATUS;

  const approveKyc = useCallback((clientId: string) => { apiApproveKyc(clientId); }, [apiApproveKyc]);
  const rejectKyc    = useCallback((clientId: string) => { apiRejectKyc(clientId); }, [apiRejectKyc]);
  const suspendClient  = useCallback((clientId: string) => { apiSuspendClient(clientId); }, [apiSuspendClient]);
  const unsuspendClient = useCallback((clientId: string) => { apiUnsuspendClient(clientId); }, [apiUnsuspendClient]);
  const approveTransaction   = useCallback(() => {}, []);
  const rejectTransaction    = useCallback(() => {}, []);
  const markNotificationRead  = useCallback((notifId: string) => { setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n)); }, []);
  const markAllNotificationsRead = useCallback(() => { setNotifications(prev => prev.map(n => ({ ...n, read: true }))); }, []);
  const resolveAlert = useCallback((alertId: string, resolution: string) => { setSurveillance(prev => prev.map(a => a.id === alertId ? { ...a, status: 'Resolved', resolution } : a)); }, []);

  return {
    config,
    clients,
    ibs: MOCK_IBS,
    clientGroups: MOCK_CLIENT_GROUPS,
    instruments: MOCK_INSTRUMENTS,
    orders: MOCK_ORDERS,
    transactions,
    surveillance,
    exposureLimits: MOCK_EXPOSURE_LIMITS,
    riskMetrics: MOCK_RISK_METRICS,
    revenueData,
    activityFeed: MOCK_ACTIVITY_FEED as ActivityEvent[],
    notifications,
    systemStatus,
    teamMembers: MOCK_TEAM_MEMBERS,
    bonuses: MOCK_BONUSES,
    auditLog: MOCK_AUDIT_LOG,
    pendingKycCount,
    pendingTxCount,
    openAlertCount,
    unreadCount,
    approveKyc,
    rejectKyc,
    suspendClient,
    unsuspendClient,
    approveTransaction,
    rejectTransaction,
    markNotificationRead,
    markAllNotificationsRead,
    resolveAlert,
  };
}