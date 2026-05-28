/**
 * File:        apps/broker-admin/src/app/(admin)/[...stub]/page.tsx
 * Module:      broker-admin · Catch-All Stub
 * Purpose:     Renders ModuleComingSoon for all Phase 2/3 routes that don't yet have
 *              a full implementation — prevents blank screens on any valid nav link
 *
 * Exports:
 *   - StubPage — default page export
 *
 * Depends on:
 *   - @/shared/components/module-coming-soon — ModuleComingSoon
 *
 * Side-effects:
 *   - none (server component)
 *
 * Key invariants:
 *   - Server component — no 'use client' needed (ModuleComingSoon has no interactivity)
 *   - MODULE_META provides curated titles/subtitles/features per route segment
 *   - Unknown routes fall back to a generic "Module" label with the slug as title
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { ModuleComingSoon } from '@/shared/components/module-coming-soon';

interface StubPageProps {
  params: Promise<{ stub: string[] }>;
}

// ─── MODULE METADATA ───────────────────────────────────────────────────────────

const MODULE_META: Record<string, { title: string; subtitle: string; features: string[] }> = {
  // CLIENTS
  ibs: {
    title: 'Introducing Brokers',
    subtitle: 'Manage your IB network, commission tiers, and referral attribution',
    features: [
      'IB hierarchy tree with sub-IB nesting',
      'Commission tier management (Standard / Silver / Gold / Platinum)',
      'MTD volume and payout tracking per IB',
      'Performance analytics and revenue share calculator',
      'Pending payout queue with one-click approval',
    ],
  },
  'client-groups': {
    title: 'Client Groups',
    subtitle: 'Segment clients by trading profile — leverage, spreads, swap, and bonus eligibility',
    features: [
      'Group creation with leverage and commission overrides',
      'Swap-free (Islamic) account configuration',
      'Bulk client assignment with audit trail',
      'Pricing rule binding per group',
    ],
  },
  // TRADING
  instruments: {
    title: 'Instruments',
    subtitle: 'Configure tradable symbols — spreads, swaps, leverage, contract specs',
    features: [
      'Symbol library with 40+ instruments across 6 asset classes',
      'Variable / fixed spread configuration',
      'Swap calendar with per-instrument long/short rates',
      'Holiday schedule and session override',
      'Bulk enable/disable with effective-from scheduling',
    ],
  },
  'pricing-rules': {
    title: 'Pricing Rules',
    subtitle: 'Define markup ladders and commission overrides per client group and instrument',
    features: [
      'Rule priority ordering with conflict resolution',
      'Bid/Ask markup configuration per symbol group',
      'Per-lot and spread-based commission modes',
      'Live preview against LP feed',
      'Group-level overrides vs global fallback',
    ],
  },
  sessions: {
    title: 'Trading Sessions',
    subtitle: 'Schedule market open/close windows, pre-market, and holiday calendars',
    features: [
      'Multi-timezone session scheduling (Sydney / Tokyo / London / NY)',
      'Per-instrument session overrides',
      'Holiday calendar with auto-close enforcement',
      'Pre-market / after-hours configuration',
      'Rollover and settlement time settings',
    ],
  },
  orders: {
    title: 'Order Management',
    subtitle: 'View and manage all client orders — open, pending, filled, and cancelled',
    features: [
      'Full order blotter with client / symbol / type filters',
      'Manual close and price-adjustment for dealer desk',
      'Requote history and slippage analysis',
      'Bulk export to CSV / PDF',
      'Order audit trail with IP and device info',
    ],
  },
  // RISK
  'exposure-limits': {
    title: 'Exposure Limits',
    subtitle: 'Configure per-symbol net exposure caps and breach alert thresholds',
    features: [
      'Hard limit and alert threshold per symbol',
      'Auto-notification when threshold is crossed',
      'Historical limit utilization chart',
      'Emergency block toggle per symbol',
    ],
  },
  surveillance: {
    title: 'Surveillance Alerts',
    subtitle: 'Automated pattern detection — layering, spoofing, wash trading, front-running',
    features: [
      'Real-time alert feed with pattern classification',
      'Trade-level evidence linking',
      'Assign to analyst workflow',
      'Escalation to regulatory reporting',
      'False-positive tagging and model feedback loop',
    ],
  },
  'aml-monitor': {
    title: 'AML Monitor',
    subtitle: 'Anti-money laundering scoring, STR filing, and enhanced due diligence queue',
    features: [
      'ML-based AML score per client (0–100)',
      'Trigger breakdown: deposit frequency, geo anomaly, velocity',
      'Suspicious Transaction Report (STR) drafting',
      'Enhanced Due Diligence (EDD) workflow',
      'FATF country risk overlay',
    ],
  },
  // FINANCE
  transactions: {
    title: 'Transactions',
    subtitle: 'Process deposits, withdrawals, bonuses, adjustments, and IB commissions',
    features: [
      'Pending queue with approve / reject / hold',
      'AML-flagged transaction review',
      'Wire / card / e-wallet / crypto reconciliation',
      'Adjustment tool with mandatory audit note',
      'Daily settlement summary and reconciliation export',
    ],
  },
  'ib-commissions': {
    title: 'IB Commissions',
    subtitle: 'Calculate, approve, and pay out IB commissions — monthly and on-demand',
    features: [
      'Automated monthly commission calculation',
      'Per-IB payout history with statement download',
      'Commission dispute resolution workflow',
      'Tier-based escalation bonuses',
    ],
  },
  bonuses: {
    title: 'Bonus Management',
    subtitle: 'Configure, issue, and track client bonuses — deposit match, no-deposit, loyalty',
    features: [
      'Bonus type builder (% match, fixed, loyalty points)',
      'Wagering / volume unlock requirements',
      'Bulk issuance with eligibility rules',
      'Abuse detection: multi-account bonus farming',
      'Bonus cost P&L impact tracking',
    ],
  },
  pnl: {
    title: 'P&L Statement',
    subtitle: 'Broker-side P&L by source — spread, commission, swap, bonuses, LP costs',
    features: [
      'Daily / monthly P&L waterfall by revenue stream',
      'A-book vs B-book profitability split',
      'Client-level P&L (top earners / losers for broker)',
      'LP cost vs internal fill P&L reconciliation',
      'Export to IFRS / GAAP compatible format',
    ],
  },
  // REPORTS
  'report-builder': {
    title: 'Report Builder',
    subtitle: 'Build custom reports from any combination of entities — clients, trades, finance',
    features: [
      'Drag-and-drop column selector across all data entities',
      'Date range, group-by, and aggregate functions',
      'One-click schedule to email or SFTP',
      'Save as template for reuse',
      'CSV, XLSX, PDF export formats',
    ],
  },
  'scheduled-reports': {
    title: 'Scheduled Reports',
    subtitle: 'Manage recurring report delivery — daily, weekly, monthly to email or SFTP',
    features: [
      'Report schedule management (cron-style)',
      'Delivery log with last-run status',
      'Pause / resume individual schedules',
      'Recipient management and substitution rules',
    ],
  },
  'regulatory-reports': {
    title: 'Regulatory Reports',
    subtitle: 'Jurisdiction-specific regulatory submissions — MiFID II, EMIR, CFTC, FSA',
    features: [
      'Transaction Reporting (MiFID II Art. 26)',
      'EMIR trade reporting to ARM',
      'Best Execution reports (RTS 27/28)',
      'Capital Adequacy reports',
      'Auto-submit to regulatory gateway with acknowledgement tracking',
    ],
  },
  // LIQUIDITY
  'lp-console': {
    title: 'LP Routing Console',
    subtitle: 'Configure A-book/B-book allocation, LP aggregation, and toxic-flow detection',
    features: [
      'A-book / B-book / Hybrid allocation per symbol and client group',
      'LP aggregator with best-bid/best-ask selection',
      'Toxic-flow detection (scalpers, news traders, latency arbitrage)',
      'LP latency and fill-rate heatmap',
      'Markup ladder per LP relationship',
    ],
  },
  'dealer-desk': {
    title: 'Dealer Desk',
    subtitle: 'Manual intervention queue — requotes, price deviations, and position management',
    features: [
      'Priority queue for orders requiring dealer action',
      'Requote interface with one-click accept/decline',
      'Price deviation alerts vs LP feed',
      'Slippage model configuration per symbol group',
      'Dealer performance metrics and SLA tracking',
    ],
  },
  // PAMM / COPY
  'pamm-manager': {
    title: 'PAMM Manager',
    subtitle: 'Percentage Allocation Money Management — master accounts, investor allocations',
    features: [
      'PAMM/MAM master account setup',
      'Investor allocation and profit distribution rules',
      'High-water mark and performance fee configuration',
      'Drawdown limit enforcement with auto-disconnect',
      'Investor consent log with digital signature',
    ],
  },
  'copy-trading': {
    title: 'Copy Trading',
    subtitle: 'Manage signal providers, followers, and copy strategy parameters',
    features: [
      'Strategy provider approval and performance verification',
      'Follower allocation and risk multiplier settings',
      'Real-time copy execution monitor',
      'Strategy leaderboard with drawdown and Sharpe metrics',
      'Provider commission and subscription fee management',
    ],
  },
  // PLATFORM
  'brand-settings': {
    title: 'Brand Settings',
    subtitle: 'Customize broker identity — logo, colors, domain, and white-label configuration',
    features: [
      'Logo and favicon upload with CDN distribution',
      'Primary brand color and theme configuration',
      'Custom domain and SSL certificate binding',
      'Email sender configuration (from-name, reply-to)',
      'Legal entity and regulatory disclosure text',
    ],
  },
  'email-templates': {
    title: 'Email Templates',
    subtitle: 'Edit transactional and marketing email templates with variable substitution',
    features: [
      'Template editor with live preview',
      'Variable placeholder library (client name, amounts, links)',
      'Multi-language template support',
      'Send test email to any address',
      'Open / click rate analytics per template',
    ],
  },
  'compliance-config': {
    title: 'Compliance Config',
    subtitle: 'Jurisdiction rules, leverage caps, suitability tests, and risk warnings',
    features: [
      'ESMA / NFA / ASIC leverage cap enforcement per jurisdiction',
      'Suitability assessment questionnaire builder',
      'Risk warning display rules (CFD overlay, margin close-out %)',
      'Negative balance protection toggle',
      'Client categorisation logic (retail vs professional)',
    ],
  },
  'api-webhooks': {
    title: 'API & Webhooks',
    subtitle: 'Manage API keys, webhook endpoints, and third-party integrations',
    features: [
      'API key creation with scope permissions',
      'Webhook endpoint configuration with secret signing',
      'Event subscription selector (deposits, KYC, trades)',
      'Delivery log with retry and dead-letter queue',
      'Rate limit configuration per key',
    ],
  },
  // WORKFLOW
  'rules-engine': {
    title: 'Rules Engine',
    subtitle: 'Visual event→condition→action workflow builder for automation',
    features: [
      'Trigger events: deposit, withdrawal, KYC approval, trade size',
      'Condition builder: balance thresholds, client type, country',
      'Actions: auto-tag VIP, issue bonus, send email, notify team',
      'Approval chain configuration with SLA timers',
      'Rule simulation on historical data before activation',
    ],
  },
  promotions: {
    title: 'Promotions',
    subtitle: 'Campaign builder for targeted promotional offers and incentive programs',
    features: [
      'Campaign creation with eligibility targeting',
      'Time-limited offer scheduling',
      'Redemption tracking and conversion funnel',
      'A/B test framework for offer variants',
      'Budget cap and fraud prevention rules',
    ],
  },
  // CRM
  'retention-crm': {
    title: 'Retention CRM',
    subtitle: 'Lead pipeline, call-center queue, cohort analytics, and retention playbooks',
    features: [
      'Lead pipeline with deal stages (Lead → Demo → Deposit → Active)',
      'Call-center queue with click-to-call integration',
      'Cohort LTV and CAC analytics',
      'Churn prediction score per client',
      'Automated retention offer trigger on inactivity',
    ],
  },
  // TEAM
  'team-members': {
    title: 'Team Members',
    subtitle: 'Manage admin team accounts, roles, and department assignments',
    features: [
      'Team member directory with role assignments',
      'Department and team grouping',
      'Two-factor authentication enforcement',
      'IP allowlist per admin account',
      'Last login and activity summary',
    ],
  },
  'roles-permissions': {
    title: 'Roles & Permissions',
    subtitle: 'Fine-grained role-based access control for all admin modules',
    features: [
      'Role builder with per-module permission matrix',
      'View / Edit / Approve / Admin permission levels',
      'Custom roles beyond system defaults',
      'Permission inheritance and override audit',
      'Role assignment log',
    ],
  },
  'audit-log': {
    title: 'Audit Log',
    subtitle: 'Immutable log of all admin actions — who did what, when, and from where',
    features: [
      'Full action history with admin name, IP, and timestamp',
      'Search by action type, entity, or actor',
      'Export for compliance and forensic review',
      'Sensitive action highlighting (KYC changes, withdrawals)',
      'Retention policy configuration',
    ],
  },
};

// ─── STATIC EXPORT — enumerate all stub paths at build time ───────────────────

export function generateStaticParams() {
  return Object.keys(MODULE_META).map(slug => ({
    stub: slug.split('/'),
  }));
}

// ─── PAGE ──────────────────────────────────────────────────────────────────────

export default async function StubPage({ params }: StubPageProps) {
  const { stub } = await params;
  const slug = stub.join('/');
  const meta = MODULE_META[slug];

  const title    = meta?.title    ?? slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  const subtitle = meta?.subtitle ?? 'This module is being built in Phase 2.';
  const features = meta?.features ?? [];

  return <ModuleComingSoon title={title} subtitle={subtitle} features={features} />;
}
