/**
 * File:        apps/broker-admin/src/app/(admin)/accounts/page.tsx
 * Module:      broker-admin · Finance · Accounts
 * Purpose:     Account list with balance preview and quick-action drawer.
 *              Real API via useAccounts() with graceful fallback to empty state.
 *
 * Exports:
 *   - default (AccountsPage) — server/client page
 *
 * Depends on:
 *   - @/lib/api/hooks/use-accounts  — useAccounts(), useAccountBalances()
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - 'use client' — API hooks require browser context
 *   - Falls back to empty accounts[] when API is unavailable
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-10
 */

'use client';

import { useState } from 'react';
import { Search, X, Wallet, Lock, TrendingUp, Zap } from 'lucide-react';
import { cn } from '@obsidian/obsidian-ui';
import { useAccounts, useAccountBalances } from '@/lib/api/hooks/use-accounts';

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:    'bg-bull/10 text-bull border-bull/25',
  DISABLED:  'bg-bear/10 text-bear border-bear/25',
  SUSPENDED: 'bg-warn/10 text-warn border-warn/25',
};

const fmtCurrency = (v: string, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(v));

function BalancesDrawer({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { balances, isLoading, error } = useAccountBalances(accountId);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-[400px] flex-col border-l border-[var(--border-md)] bg-[var(--bg-panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-display text-[14px] font-semibold tracking-wide text-fg1 uppercase">
            Account Balances
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-xs"><X size={13} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <span className="font-ui text-[12px] text-fg3">Loading…</span>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-[var(--bear)]/30 bg-[var(--bear)]/5 p-4">
              <p className="font-ui text-[12px] text-[var(--bear)]">{error}</p>
            </div>
          )}
          {balances && (
            <div className="space-y-3">
              {[
                { label: 'TOTAL CASH', value: balances.totalCash, icon: Wallet, color: 'text-fg1' },
                { label: 'LOCKED (HOLD)', value: balances.lockedCash, icon: Lock, color: 'text-warn' },
                { label: 'AVAILABLE', value: balances.availableCash, icon: TrendingUp, color: 'text-bull' },
                { label: 'POSITIONS VALUE', value: balances.positionsValue, icon: Zap, color: 'text-fg1' },
                { label: 'UNREALIZED P&L', value: balances.unrealizedPnl, icon: TrendingUp, color: Number(balances.unrealizedPnl) >= 0 ? 'text-bull' : 'text-bear' },
                { label: 'EQUITY', value: balances.equity, icon: TrendingUp, color: 'text-fg1' },
                { label: 'BUYING POWER', value: balances.buyingPower, icon: Zap, color: 'text-accent' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[9px] font-semibold tracking-widest text-fg3 uppercase">
                      {label}
                    </span>
                    <Icon size={12} className="text-fg3" />
                  </div>
                  <p
                    className={cn('mt-1.5 font-mono text-[16px] font-bold', color)}
                    style={{ fontFeatureSettings: '"tnum" 1' }}
                  >
                    {fmtCurrency(value, balances.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function AccountsPage() {
  const { accounts, isLoading, error } = useAccounts();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = accounts.filter(a =>
    !search ||
    a.userId.toLowerCase().includes(search.toLowerCase()) ||
    a.baseCurrency.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      {/* Header */}
      <div className="module-header">
        <div>
          <h1 className="module-title">Accounts</h1>
          <p className="module-subtitle">
            {isLoading ? 'Loading…' : error
              ? <span className="text-[var(--bear)]">{error}</span>
              : `${filtered.length} of ${accounts.length} accounts`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-6 py-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg3" />
          <input
            className="input input-sm pl-7"
            placeholder="Search by user ID or currency…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <button
            className="btn btn-ghost btn-xs gap-1"
            onClick={() => setSearch('')}
          >
            <X size={10} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {accounts.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Wallet size={28} className="text-fg3" />
            <p className="font-ui text-[12px] text-fg2">No accounts found</p>
            <p className="font-ui text-[11px] text-fg3">
              {error ? `API error: ${error}` : 'Accounts appear when clients open a live or demo account'}
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ACCOUNT ID</th>
                <th>USER ID</th>
                <th>TYPE</th>
                <th>CURRENCY</th>
                <th>STATUS</th>
                <th>CREATED</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(account => (
                <tr
                  key={account.id}
                  onClick={() => setSelected(account.id)}
                  className="cursor-pointer"
                >
                  <td className="mono-cell text-fg3">{account.id}</td>
                  <td className="mono-cell text-fg2">{account.userId}</td>
                  <td>
                    <span className={cn('badge', account.accountType === 'DEMO' ? 'badge-purple' : 'badge-accent')}>
                      {account.accountType}
                    </span>
                  </td>
                  <td className="font-mono text-[12px] text-fg1">{account.baseCurrency}</td>
                  <td>
                    <span className={cn('badge border', STATUS_STYLE[account.status] ?? 'badge-muted')}>
                      {account.status}
                    </span>
                  </td>
                  <td className="font-ui text-[11px] text-fg3">
                    {new Date(account.createdAt).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Balances drawer */}
      {selected && (
        <BalancesDrawer accountId={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}