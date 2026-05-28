/**
 * File:        apps/broker-admin/src/shared/sidebar/sidebar.tsx
 * Module:      broker-admin · Sidebar Navigation
 * Purpose:     Collapsible Obsidian-styled sidebar for Broker Admin — 38 modules, 12 sections
 *
 * Exports:
 *   - BrokerSidebar() — client component
 *
 * Depends on:
 *   - ./nav-config         — NAV_GROUPS
 *   - @obsidian/obsidian-ui — cn()
 *   - next/navigation      — usePathname()
 *   - lucide-react         — icons
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - 'use client' required for usePathname + useState
 *   - Collapsed: w-14, icons only; Expanded: w-60, labels + badges
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, AlertTriangle, BarChart2, Bell, BookOpen, Bot, Briefcase,
  ChevronRight, ChevronsLeft, ChevronsRight, ClipboardList, Code,
  DollarSign, FileText, Filter, Layers, LayoutDashboard, Link2,
  Megaphone, PieChart, Shield, TrendingUp, Users, Users2, UserCheck,
  Wallet, Webhook, Zap, Settings, RefreshCw, UserCog,
} from 'lucide-react';
import { cn } from '@obsidian/obsidian-ui';
import { NAV_GROUPS } from './nav-config';
import { useBrokerData } from '../../lib/mock-data-context';

const ICON_MAP: Record<string, React.ReactNode> = {
  'dashboard':           <LayoutDashboard size={15} strokeWidth={2} />,
  'live-monitor':        <Activity size={15} strokeWidth={2} />,
  'clients':             <Users size={15} strokeWidth={2} />,
  'kyc-queue':           <UserCheck size={15} strokeWidth={2} />,
  'ibs':                 <Link2 size={15} strokeWidth={2} />,
  'client-groups':       <Users2 size={15} strokeWidth={2} />,
  'instruments':         <Layers size={15} strokeWidth={2} />,
  'pricing-rules':       <Filter size={15} strokeWidth={2} />,
  'sessions':            <RefreshCw size={15} strokeWidth={2} />,
  'orders':              <ClipboardList size={15} strokeWidth={2} />,
  'risk-dashboard':      <Shield size={15} strokeWidth={2} />,
  'exposure-limits':     <BarChart2 size={15} strokeWidth={2} />,
  'surveillance':        <AlertTriangle size={15} strokeWidth={2} />,
  'aml-monitor':         <Bot size={15} strokeWidth={2} />,
  'transactions':        <DollarSign size={15} strokeWidth={2} />,
  'ib-commissions':      <Wallet size={15} strokeWidth={2} />,
  'bonuses':             <Zap size={15} strokeWidth={2} />,
  'pnl':                 <TrendingUp size={15} strokeWidth={2} />,
  'report-builder':      <FileText size={15} strokeWidth={2} />,
  'scheduled-reports':   <Bell size={15} strokeWidth={2} />,
  'regulatory-reports':  <BookOpen size={15} strokeWidth={2} />,
  'lp-console':          <Zap size={15} strokeWidth={2} />,
  'dealer-desk':         <Briefcase size={15} strokeWidth={2} />,
  'pamm-manager':        <PieChart size={15} strokeWidth={2} />,
  'copy-trading':        <Code size={15} strokeWidth={2} />,
  'brand-settings':      <Settings size={15} strokeWidth={2} />,
  'email-templates':     <Megaphone size={15} strokeWidth={2} />,
  'compliance-config':   <Shield size={15} strokeWidth={2} />,
  'api-webhooks':        <Webhook size={15} strokeWidth={2} />,
  'rules-engine':        <ChevronRight size={15} strokeWidth={2} />,
  'promotions':          <Megaphone size={15} strokeWidth={2} />,
  'retention-crm':       <Users size={15} strokeWidth={2} />,
  'team-members':        <Users2 size={15} strokeWidth={2} />,
  'roles-permissions':   <UserCog size={15} strokeWidth={2} />,
  'audit-log':           <ClipboardList size={15} strokeWidth={2} />,
};

export function BrokerSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { config, pendingKycCount, pendingTxCount, openAlertCount } = useBrokerData();

  const dynamicBadges: Record<string, string> = {
    'kyc-queue':    String(pendingKycCount),
    'transactions': String(pendingTxCount),
    'surveillance': String(openAlertCount),
  };

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-[var(--border)] bg-[var(--bg-surface)] transition-[width] duration-200 ease-in-out shrink-0 overflow-hidden',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      {/* Logo / Brand */}
      <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-3 py-3.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-r-md bg-gradient-to-br from-accent to-purple font-display text-[11px] font-bold text-white">
          A
        </div>
        {!collapsed && (
          <div className="min-w-0 overflow-hidden">
            <div className="truncate font-display text-[12px] font-bold tracking-widest text-fg1 uppercase">
              {config.name}
            </div>
            <div className="font-mono text-[10px] text-fg3">
              {config.jurisdiction} · v{config.version}
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className={cn(
            'ml-auto shrink-0 rounded-r-sm p-1 text-fg3 hover:bg-[var(--bg-hover)] hover:text-fg2 transition-colors',
            collapsed && 'mx-auto',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronsRight size={14} strokeWidth={2} />
            : <ChevronsLeft  size={14} strokeWidth={2} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-1 scrollbar-none">
        {NAV_GROUPS.map((group) => {
          const badge = group.items.reduce((acc, item) => {
            const live = dynamicBadges[item.id];
            return live ? acc + parseInt(live, 10) : acc;
          }, 0);

          return (
            <div key={group.section} className="mb-0.5">
              {!collapsed && (
                <div className="flex items-center gap-2 px-3 pb-0.5 pt-3">
                  <span className="font-display text-[9px] font-semibold tracking-[0.12em] text-fg3 uppercase">
                    {group.section}
                  </span>
                  {badge > 0 && (
                    <span className="rounded-full bg-bear/20 px-1 font-mono text-[9px] text-bear">
                      {badge}
                    </span>
                  )}
                </div>
              )}
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const liveBadge = dynamicBadges[item.id] ?? item.badge;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      'mx-1 my-0.5 flex items-center gap-2 rounded-r-sm px-2 py-1.5 text-[12px] transition-colors duration-[120ms]',
                      isActive
                        ? 'border border-accent/20 bg-accent/10 text-accent'
                        : 'text-fg2 hover:bg-[var(--bg-hover)] hover:text-fg1',
                      collapsed && 'justify-center px-0',
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="shrink-0">
                      {ICON_MAP[item.id] ?? <LayoutDashboard size={15} strokeWidth={2} />}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate font-ui">{item.label}</span>
                        {liveBadge && liveBadge !== '0' && (
                          <span
                            className={cn(
                              'rounded-full border px-1.5 font-mono text-[10px]',
                              item.badgeWarn
                                ? 'border-warn/30 bg-warn/10 text-warn'
                                : 'border-[var(--border-md)] bg-[var(--bg-elevated)] text-fg3',
                            )}
                          >
                            {liveBadge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
        <div className="h-4" />
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t border-[var(--border)] px-3 py-2.5">
          <div className="font-mono text-[10px] text-fg3">Broker Admin Console</div>
          <div className="mt-0.5 font-mono text-[10px] text-fg3">
            {config.licenseNumber} · Obsidian Platform
          </div>
        </div>
      )}
    </aside>
  );
}
