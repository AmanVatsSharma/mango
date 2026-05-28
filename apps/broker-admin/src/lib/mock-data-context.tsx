/**
 * File:        apps/broker-admin/src/lib/mock-data-context.tsx
 * Module:      broker-admin · Mock Data Context
 * Purpose:     React context providing all broker mock data + mutation actions to the app
 *
 * Exports:
 *   - MockBrokerDataProvider(children) — wraps the app with context
 *   - useBrokerData()                  — hook returning state + actions
 *
 * Depends on:
 *   - ./mock-data  — seed data constants
 *   - ./types      — all entity types
 *
 * Side-effects:
 *   - In-memory React state only; resets on page reload
 *
 * Key invariants:
 *   - 'use client' — context uses useState, cannot be a server component
 *   - Actions return void and mutate state via setState; no async
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  BROKER_CONFIG,
  MOCK_ACTIVITY_FEED,
  MOCK_AUDIT_LOG,
  MOCK_BONUSES,
  MOCK_CLIENT_GROUPS,
  MOCK_CLIENTS,
  MOCK_EXPOSURE_LIMITS,
  MOCK_IBS,
  MOCK_INSTRUMENTS,
  MOCK_NOTIFICATIONS,
  MOCK_ORDERS,
  MOCK_REVENUE_DATA,
  MOCK_RISK_METRICS,
  MOCK_SURVEILLANCE,
  MOCK_SYSTEM_STATUS,
  MOCK_TEAM_MEMBERS,
  MOCK_TRANSACTIONS,
} from './mock-data';
import type {
  ActivityEvent,
  AuditLogEntry,
  Bonus,
  BrokerConfig,
  Client,
  ClientGroup,
  ExposureLimit,
  Instrument,
  IntroducingBroker,
  KYCStatus,
  Notification,
  Order,
  RevenuePoint,
  RiskMetric,
  SurveillanceAlert,
  SystemStatus,
  TeamMember,
  Transaction,
} from './types';

interface BrokerDataState {
  config: BrokerConfig;
  clients: Client[];
  ibs: IntroducingBroker[];
  clientGroups: ClientGroup[];
  instruments: Instrument[];
  orders: Order[];
  transactions: Transaction[];
  surveillance: SurveillanceAlert[];
  exposureLimits: ExposureLimit[];
  riskMetrics: RiskMetric[];
  revenueData: RevenuePoint[];
  activityFeed: ActivityEvent[];
  notifications: Notification[];
  systemStatus: SystemStatus[];
  teamMembers: TeamMember[];
  bonuses: Bonus[];
  auditLog: AuditLogEntry[];
}

interface BrokerDataActions {
  approveKyc: (clientId: string) => void;
  rejectKyc: (clientId: string) => void;
  suspendClient: (clientId: string) => void;
  unsuspendClient: (clientId: string) => void;
  approveTransaction: (txId: string) => void;
  rejectTransaction: (txId: string) => void;
  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: () => void;
  resolveAlert: (alertId: string, resolution: string) => void;
}

type BrokerDataContextValue = BrokerDataState & BrokerDataActions & {
  unreadCount: number;
  pendingKycCount: number;
  pendingTxCount: number;
  openAlertCount: number;
};

const BrokerDataContext = createContext<BrokerDataContextValue | null>(null);

export function MockBrokerDataProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>(MOCK_CLIENTS);
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [surveillance, setSurveillance] = useState<SurveillanceAlert[]>(MOCK_SURVEILLANCE);

  const approveKyc = useCallback((clientId: string) => {
    setClients(prev => prev.map(c =>
      c.id === clientId ? { ...c, kyc: 'Verified' as KYCStatus, status: 'Active' } : c
    ));
  }, []);

  const rejectKyc = useCallback((clientId: string) => {
    setClients(prev => prev.map(c =>
      c.id === clientId ? { ...c, kyc: 'Rejected' as KYCStatus } : c
    ));
  }, []);

  const suspendClient = useCallback((clientId: string) => {
    setClients(prev => prev.map(c =>
      c.id === clientId ? { ...c, status: 'Suspended' } : c
    ));
  }, []);

  const unsuspendClient = useCallback((clientId: string) => {
    setClients(prev => prev.map(c =>
      c.id === clientId ? { ...c, status: 'Active' } : c
    ));
  }, []);

  const approveTransaction = useCallback((txId: string) => {
    setTransactions(prev => prev.map(t =>
      t.id === txId ? { ...t, status: 'Completed', processedAt: new Date().toISOString() } : t
    ));
  }, []);

  const rejectTransaction = useCallback((txId: string) => {
    setTransactions(prev => prev.map(t =>
      t.id === txId ? { ...t, status: 'Rejected' } : t
    ));
  }, []);

  const markNotificationRead = useCallback((notifId: string) => {
    setNotifications(prev => prev.map(n =>
      n.id === notifId ? { ...n, read: true } : n
    ));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const resolveAlert = useCallback((alertId: string, resolution: string) => {
    setSurveillance(prev => prev.map(a =>
      a.id === alertId ? { ...a, status: 'Resolved', resolution } : a
    ));
  }, []);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
  const pendingKycCount = useMemo(() => clients.filter(c => c.kyc === 'Pending').length, [clients]);
  const pendingTxCount = useMemo(() => transactions.filter(t => t.status === 'Pending').length, [transactions]);
  const openAlertCount = useMemo(() => surveillance.filter(a => a.status === 'Open').length, [surveillance]);

  const value = useMemo<BrokerDataContextValue>(() => ({
    config: BROKER_CONFIG,
    clients,
    ibs: MOCK_IBS,
    clientGroups: MOCK_CLIENT_GROUPS,
    instruments: MOCK_INSTRUMENTS,
    orders: MOCK_ORDERS,
    transactions,
    surveillance,
    exposureLimits: MOCK_EXPOSURE_LIMITS,
    riskMetrics: MOCK_RISK_METRICS,
    revenueData: MOCK_REVENUE_DATA,
    activityFeed: MOCK_ACTIVITY_FEED,
    notifications,
    systemStatus: MOCK_SYSTEM_STATUS,
    teamMembers: MOCK_TEAM_MEMBERS,
    bonuses: MOCK_BONUSES,
    auditLog: MOCK_AUDIT_LOG,
    approveKyc,
    rejectKyc,
    suspendClient,
    unsuspendClient,
    approveTransaction,
    rejectTransaction,
    markNotificationRead,
    markAllNotificationsRead,
    resolveAlert,
    unreadCount,
    pendingKycCount,
    pendingTxCount,
    openAlertCount,
  }), [
    clients, transactions, surveillance, notifications,
    approveKyc, rejectKyc, suspendClient, unsuspendClient,
    approveTransaction, rejectTransaction,
    markNotificationRead, markAllNotificationsRead, resolveAlert,
    unreadCount, pendingKycCount, pendingTxCount, openAlertCount,
  ]);

  return (
    <BrokerDataContext.Provider value={value}>
      {children}
    </BrokerDataContext.Provider>
  );
}

export function useBrokerData(): BrokerDataContextValue {
  const ctx = useContext(BrokerDataContext);
  if (!ctx) throw new Error('useBrokerData must be used inside MockBrokerDataProvider');
  return ctx;
}
