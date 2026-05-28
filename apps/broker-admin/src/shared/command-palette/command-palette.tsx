/**
 * File:        apps/broker-admin/src/shared/command-palette/command-palette.tsx
 * Module:      broker-admin · Command Palette
 * Purpose:     ⌘K quick-nav palette — fuzzy search across all 38 modules with keyboard navigation
 *
 * Exports:
 *   - CommandPalette({ open, onClose }) — modal overlay component
 *
 * Depends on:
 *   - next/navigation — useRouter
 *   - lucide-react    — Search icon
 *
 * Side-effects:
 *   - Adds/removes keydown listener on mount/unmount
 *
 * Key invariants:
 *   - Focus is trapped in the input on open (setTimeout 50ms for animation)
 *   - 'use client' — uses useEffect, useState, useRef
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-26
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { cn } from '@obsidian/obsidian-ui';

interface CommandItem {
  label: string;
  sub: string;
  href: string;
  badge?: string;
}

const CMD_ITEMS: CommandItem[] = [
  { label: 'Dashboard',           sub: 'Overview',            href: '/dashboard' },
  { label: 'Live Monitor',        sub: 'Overview',            href: '/live-monitor' },
  { label: 'All Clients',         sub: 'Clients',             href: '/clients' },
  { label: 'KYC Queue',           sub: 'Clients · 14 pending',href: '/kyc-queue',        badge: '14' },
  { label: 'Introducing Brokers', sub: 'Clients',             href: '/ibs' },
  { label: 'Client Groups',       sub: 'Clients',             href: '/client-groups' },
  { label: 'Instruments',         sub: 'Trading',             href: '/instruments' },
  { label: 'Pricing Rules',       sub: 'Trading',             href: '/pricing-rules' },
  { label: 'Trading Sessions',    sub: 'Trading',             href: '/trading-sessions' },
  { label: 'Order Management',    sub: 'Trading',             href: '/orders' },
  { label: 'Risk Dashboard',      sub: 'Risk & Compliance',   href: '/risk-dashboard' },
  { label: 'Exposure Limits',     sub: 'Risk & Compliance',   href: '/exposure-limits' },
  { label: 'Surveillance Alerts', sub: 'Risk · 3 open',      href: '/surveillance',     badge: '3' },
  { label: 'AML Monitor',         sub: 'Risk & Compliance',   href: '/aml-monitor' },
  { label: 'Transactions',        sub: 'Finance · 23 pending',href: '/transactions',     badge: '23' },
  { label: 'IB Commissions',      sub: 'Finance',             href: '/ib-commissions' },
  { label: 'Bonuses',             sub: 'Finance',             href: '/bonuses' },
  { label: 'P&L Statement',       sub: 'Finance',             href: '/pnl' },
  { label: 'Report Builder',      sub: 'Reports',             href: '/report-builder' },
  { label: 'Scheduled Reports',   sub: 'Reports',             href: '/scheduled-reports' },
  { label: 'Regulatory Reports',  sub: 'Reports',             href: '/regulatory-reports' },
  { label: 'LP Routing Console',  sub: 'Liquidity',           href: '/lp-console' },
  { label: 'Dealer Desk',         sub: 'Liquidity · 5 pending',href: '/dealer-desk',     badge: '5' },
  { label: 'PAMM Manager',        sub: 'PAMM / Copy',         href: '/pamm-manager' },
  { label: 'Copy Trading',        sub: 'PAMM / Copy',         href: '/copy-trading' },
  { label: 'Brand Settings',      sub: 'Platform',            href: '/brand-settings' },
  { label: 'Email Templates',     sub: 'Platform',            href: '/email-templates' },
  { label: 'Compliance Config',   sub: 'Platform',            href: '/compliance-config' },
  { label: 'API & Webhooks',      sub: 'Platform',            href: '/api-webhooks' },
  { label: 'Rules Engine',        sub: 'Workflow',            href: '/rules-engine' },
  { label: 'Promotions',          sub: 'Workflow',            href: '/promotions' },
  { label: 'Retention CRM',       sub: 'CRM',                 href: '/retention-crm' },
  { label: 'Team Members',        sub: 'Team',                href: '/team-members' },
  { label: 'Roles & Permissions', sub: 'Team',                href: '/roles-permissions' },
  { label: 'Audit Log',           sub: 'Team',                href: '/audit-log' },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = query.trim()
    ? CMD_ITEMS.filter(i =>
        i.label.toLowerCase().includes(query.toLowerCase()) ||
        i.sub.toLowerCase().includes(query.toLowerCase())
      )
    : CMD_ITEMS.slice(0, 9);

  useEffect(() => {
    if (open) {
      setQuery('');
      setFocused(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setFocused(0);
  }, [query]);

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === 'Enter' && filtered[focused]) navigate(filtered[focused].href);
    if (e.key === 'Escape') onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-r-lg border border-[var(--border-md)] bg-[var(--bg-elevated)] shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search size={16} strokeWidth={2} className="shrink-0 text-fg3" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent font-ui text-[13px] text-fg1 placeholder:text-fg3 outline-none"
            placeholder="Search modules, clients, transactions..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          <kbd className="shrink-0 rounded border border-[var(--border-md)] bg-[var(--bg-panel)] px-1.5 font-mono text-[9px] text-fg3">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto">
          {!query.trim() && (
            <div className="px-4 py-2 font-display text-[9px] font-semibold tracking-[0.1em] text-fg3 uppercase">
              Recent Modules
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center font-ui text-[13px] text-fg3">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.href}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  focused === i
                    ? 'bg-accent/10 text-fg1'
                    : 'text-fg2 hover:bg-[var(--bg-hover)] hover:text-fg1',
                )}
                onMouseEnter={() => setFocused(i)}
                onClick={() => navigate(item.href)}
              >
                <span className="flex-1 font-ui text-[13px]">{item.label}</span>
                <span className="font-mono text-[11px] text-fg3">{item.sub}</span>
                {item.badge && (
                  <span className="rounded-full border border-[var(--border-md)] bg-[var(--bg-panel)] px-1.5 font-mono text-[10px] text-fg3">
                    {item.badge}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-2">
          <span className="font-mono text-[10px] text-fg3">↑↓ navigate</span>
          <span className="font-mono text-[10px] text-fg3">↵ open</span>
          <span className="ml-auto font-mono text-[10px] text-fg3">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
