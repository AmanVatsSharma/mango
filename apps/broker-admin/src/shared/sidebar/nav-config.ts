/**
 * File:        apps/broker-admin/src/shared/sidebar/nav-config.ts
 * Module:      broker-admin · Navigation
 * Purpose:     Full 38-module nav tree for Broker Admin — maps to app/(admin) route segments
 *
 * Exports:
 *   - NAV_GROUPS (NavGroup[]) — 12 section groups covering all broker admin modules
 *
 * Side-effects:
 *   - none
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import type { NavGroup } from '../../lib/types';

export const NAV_GROUPS: NavGroup[] = [
  {
    section: 'OVERVIEW',
    items: [
      { id: 'dashboard',    label: 'Dashboard',     href: '/dashboard' },
      { id: 'live-monitor', label: 'Live Monitor',   href: '/live-monitor' },
    ],
  },
  {
    section: 'CLIENTS',
    items: [
      { id: 'clients',       label: 'All Clients',          href: '/clients' },
      { id: 'kyc-queue',     label: 'KYC Queue',            href: '/kyc-queue',     badge: '14' },
      { id: 'ibs',           label: 'Introducing Brokers',  href: '/ibs' },
      { id: 'client-groups', label: 'Client Groups',        href: '/client-groups' },
    ],
  },
  {
    section: 'TRADING',
    items: [
      { id: 'instruments',   label: 'Instruments',      href: '/instruments' },
      { id: 'pricing-rules', label: 'Pricing Rules',    href: '/pricing-rules' },
      { id: 'sessions',      label: 'Trading Sessions', href: '/trading-sessions' },
      { id: 'orders',        label: 'Order Management', href: '/orders' },
    ],
  },
  {
    section: 'RISK & COMPLIANCE',
    items: [
      { id: 'risk-dashboard',  label: 'Risk Dashboard',      href: '/risk-dashboard' },
      { id: 'exposure-limits', label: 'Exposure Limits',     href: '/exposure-limits' },
      { id: 'surveillance',    label: 'Surveillance Alerts', href: '/surveillance', badge: '3', badgeWarn: true },
      { id: 'aml-monitor',     label: 'AML Monitor',         href: '/aml-monitor' },
    ],
  },
  {
    section: 'FINANCE',
    items: [
      { id: 'transactions',   label: 'Transactions',    href: '/transactions', badge: '23' },
      { id: 'ib-commissions', label: 'IB Commissions',  href: '/ib-commissions' },
      { id: 'bonuses',        label: 'Bonuses',          href: '/bonuses' },
      { id: 'pnl',            label: 'P&L Statement',   href: '/pnl' },
    ],
  },
  {
    section: 'REPORTS',
    items: [
      { id: 'report-builder',     label: 'Report Builder',     href: '/report-builder' },
      { id: 'scheduled-reports',  label: 'Scheduled Reports',  href: '/scheduled-reports' },
      { id: 'regulatory-reports', label: 'Regulatory Reports', href: '/regulatory-reports' },
    ],
  },
  {
    section: 'LIQUIDITY',
    items: [
      { id: 'lp-console',  label: 'LP Routing Console', href: '/lp-console' },
      { id: 'dealer-desk', label: 'Dealer Desk',         href: '/dealer-desk', badge: '5', badgeWarn: true },
    ],
  },
  {
    section: 'PAMM / COPY',
    items: [
      { id: 'pamm-manager', label: 'PAMM Manager',  href: '/pamm-manager' },
      { id: 'copy-trading', label: 'Copy Trading',  href: '/copy-trading' },
    ],
  },
  {
    section: 'PLATFORM',
    items: [
      { id: 'brand-settings',    label: 'Brand Settings',   href: '/brand-settings' },
      { id: 'domains',          label: 'Domains',          href: '/domains' },
      { id: 'deployment',        label: 'Deployment',       href: '/deployment' },
      { id: 'email-templates',   label: 'Email Templates',  href: '/email-templates' },
      { id: 'compliance-config', label: 'Compliance Config',href: '/compliance-config' },
      { id: 'api-webhooks',      label: 'API & Webhooks',   href: '/api-webhooks' },
    ],
  },
  {
    section: 'WORKFLOW',
    items: [
      { id: 'rules-engine', label: 'Rules Engine', href: '/rules-engine' },
      { id: 'promotions',   label: 'Promotions',   href: '/promotions' },
    ],
  },
  {
    section: 'CRM',
    items: [
      { id: 'retention-crm', label: 'Retention CRM', href: '/retention-crm' },
    ],
  },
  {
    section: 'TEAM',
    items: [
      { id: 'team-members',       label: 'Members',            href: '/team-members' },
      { id: 'roles-permissions',  label: 'Roles & Permissions',href: '/roles-permissions' },
      { id: 'audit-log',          label: 'Audit Log',          href: '/audit-log' },
    ],
  },
];
