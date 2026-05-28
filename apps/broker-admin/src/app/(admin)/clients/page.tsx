/**
 * File:        apps/broker-admin/src/app/(admin)/clients/page.tsx
 * Module:      broker-admin · Clients
 * Purpose:     Searchable, filterable, sortable client table with slide-in drawer for
 *              account overview, positions, transactions, notes, and quick-actions.
 *              Client list and actions are backed by real API via useClientsApi().
 *
 * Exports:
 *   - ClientsPage — default page export
 *
 * Depends on:
 *   - @/lib/api/hooks/use-clients — useClientsApi() for real API data
 *   - @/lib/mock-data             — MOCK_ORDERS, MOCK_TRANSACTIONS for drawer detail
 *
 * Side-effects:
 *   - Calls GET /admin/users, PATCH /admin/users/:id, POST /admin/users/:id/deactivate|reactivate
 *
 * Key invariants:
 *   - 'use client' — filter state, drawer open state
 *   - Drawer overlays the page via fixed position; body scroll is locked when open
 *   - useMemo gates: clients → filtered → sorted; only re-computes on filter/sort change
 *   - Actions passed as props to ClientDrawer — no direct useBrokerData() in the drawer
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Search, Filter, Download, UserPlus, ChevronUp, ChevronDown,
  X, CheckCircle2, Ban, FileText, StickyNote, AlertTriangle,
  TrendingUp, TrendingDown, Wallet, BarChart2, Shield, Phone, Mail,
} from 'lucide-react';
import { useClientsApi } from '@/lib/api/hooks/use-clients';
import { useAccountBalances } from '@/lib/api/hooks/use-account-balances';
import { MOCK_ORDERS, MOCK_TRANSACTIONS } from '@/lib/mock-data';
import type { Client, ClientStatus, ClientType, KYCStatus } from '@/lib/types';
import type { AccountBalances } from '@/lib/api/hooks/use-account-balances';

// ─── HELPERS ───────────────────────────────────────────────────────────────────

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtPnl = (n: number) => {
  const abs = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Math.abs(n));
  return n >= 0 ? `+${abs}` : `-${abs.slice(1)}`;
};

const pnlClass = (n: number) => n > 0 ? 'delta-positive' : n < 0 ? 'delta-negative' : 'delta-neutral';

type SortKey = 'name' | 'balance' | 'equity' | 'floatPnl' | 'volumeMTD' | 'regDate';
type SortDir = 'asc' | 'desc';

function kycBadgeClass(kyc: KYCStatus) {
  switch (kyc) {
    case 'Verified':  return 'kyc-verified';
    case 'Pending':   return 'kyc-pending';
    case 'Rejected':  return 'kyc-rejected';
    case 'Expired':   return 'kyc-expired';
    case 'In Review': return 'badge badge-warn';
    default:          return 'badge badge-muted';
  }
}

function statusBadgeClass(s: ClientStatus) {
  switch (s) {
    case 'Active':    return 'status-active';
    case 'Pending':   return 'status-pending';
    case 'Suspended': return 'status-suspended';
    case 'Dormant':   return 'status-dormant';
    default:          return 'badge badge-muted';
  }
}

function typeBadgeClass(t: ClientType) {
  switch (t) {
    case 'VIP':           return 'type-vip';
    case 'Pro':           return 'type-pro';
    case 'Retail':        return 'type-retail';
    case 'Institutional': return 'type-institutional';
    default:              return 'badge badge-muted';
  }
}

// ─── CLIENT DRAWER ─────────────────────────────────────────────────────────────

interface ClientDrawerProps {
  client: Client;
  balances: AccountBalances | null;
  onClose: () => void;
  approveKyc: (id: string) => void;
  rejectKyc: (id: string) => void;
  suspendClient: (id: string) => void;
  unsuspendClient: (id: string) => void;
}

function ClientDrawer({ client, balances, onClose, approveKyc, rejectKyc, suspendClient, unsuspendClient }: ClientDrawerProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'transactions' | 'notes' | 'kyc'>('overview');
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const clientOrders = MOCK_ORDERS.filter(o => o.clientId === client.id);
  const clientTxns   = MOCK_TRANSACTIONS.filter(t => t.clientId === client.id);

  const TABS = ['overview', 'positions', 'transactions', 'notes', 'kyc'] as const;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-[520px] flex-col border-l border-[var(--border-md)] bg-[var(--bg-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{client.flag}</span>
              <h2 className="font-display text-[15px] font-semibold text-fg1">{client.name}</h2>
              <span className={typeBadgeClass(client.type)}>{client.type}</span>
              <span className={statusBadgeClass(client.status)}>{client.status}</span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-mono text-[11px] text-fg3">{client.id}</span>
              <span className="font-ui text-[11px] text-fg3">{client.email}</span>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs">
            <X size={13} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 font-ui text-[11px] capitalize transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-accent text-fg1'
                  : 'text-fg3 hover:text-fg2'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="space-y-4 p-5">
              {/* Account Metrics */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'BALANCE', value: balances ? fmtUSD(balances.balance) : fmtUSD(client.balance), icon: Wallet, color: 'text-fg1' },
                  { label: 'EQUITY', value: balances ? fmtUSD(balances.equity) : fmtUSD(client.equity), icon: TrendingUp, color: 'text-fg1' },
                  { label: 'FLOAT P&L', value: balances ? fmtPnl(balances.unrealizedPnL) : fmtPnl(client.floatPnl), icon: BarChart2, color: pnlClass(balances?.unrealizedPnL ?? client.floatPnl) },
                  { label: 'MARGIN', value: balances?.marginPct != null ? `${balances.marginPct.toFixed(1)}%` : client.marginPct != null ? `${client.marginPct}%` : '—', icon: Shield, color: (balances?.marginPct ?? client.marginPct ?? 999) < 150 ? 'text-bear' : 'text-fg1' },
                ].map(m => (
                  <div key={m.label} className="card p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[9px] font-semibold tracking-widest text-fg3 uppercase">{m.label}</span>
                      <m.icon size={12} className="text-fg3" />
                    </div>
                    <p className={`mt-1.5 font-mono text-[16px] font-bold ${m.color}`} style={{ fontFeatureSettings: '"tnum" 1' }}>
                      {m.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Key Info */}
              <div className="card divide-y divide-[var(--border)]">
                {[
                  { label: 'Leverage', value: client.leverage },
                  { label: 'Open Positions', value: client.openPositions.toString() },
                  { label: 'Volume MTD', value: `${client.volumeMTD} lots` },
                  { label: 'Total Deposited', value: fmtUSD(client.totalDeposited) },
                  { label: 'Total Withdrawn', value: fmtUSD(client.totalWithdrawn) },
                  { label: 'KYC Level', value: client.kycLevel },
                  { label: 'Introducing Broker', value: client.ib ?? 'None' },
                  { label: 'Platforms', value: client.platform.join(', ') },
                  { label: 'AML Score', value: `${client.amlScore} (${client.amlStatus})` },
                  { label: 'Registered', value: client.regDate },
                  { label: 'Last Login', value: client.lastLogin },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between px-3 py-2">
                    <span className="font-ui text-[11px] text-fg3">{row.label}</span>
                    <span className="font-mono text-[11px] text-fg1">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Contact */}
              <div className="flex gap-2">
                <a href={`mailto:${client.email}`} className="btn btn-ghost btn-sm flex-1 gap-2">
                  <Mail size={12} /> Email
                </a>
                <a href={`tel:${client.phone}`} className="btn btn-ghost btn-sm flex-1 gap-2">
                  <Phone size={12} /> Call
                </a>
              </div>
            </div>
          )}

          {/* ── Positions ── */}
          {activeTab === 'positions' && (
            <div>
              {clientOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <BarChart2 size={28} className="text-fg3" />
                  <p className="font-ui text-[12px] text-fg2">No positions</p>
                  <p className="font-ui text-[11px] text-fg3">This client has no open or recent orders</p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ORDER</th>
                      <th>SYMBOL</th>
                      <th>SIDE</th>
                      <th>LOTS</th>
                      <th>FLOAT P&L</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientOrders.map(o => (
                      <tr key={o.id}>
                        <td className="mono-cell text-fg3">{o.id}</td>
                        <td className="mono-cell font-semibold">{o.symbol}</td>
                        <td>
                          <span className={o.side === 'Buy' ? 'text-bull font-semibold' : 'text-bear font-semibold'}>
                            {o.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="mono-cell">{o.lots.toFixed(2)}</td>
                        <td>
                          <span className={`font-mono text-[12px] ${pnlClass(o.floatPnl ?? o.realizedPnl ?? 0)}`} style={{ fontFeatureSettings: '"tnum" 1' }}>
                            {o.floatPnl != null ? fmtPnl(o.floatPnl) : o.realizedPnl != null ? fmtPnl(o.realizedPnl) : '—'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${o.status === 'Open' ? 'badge-bull' : o.status === 'Filled' ? 'badge-muted' : 'badge-warn'}`}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Transactions ── */}
          {activeTab === 'transactions' && (
            <div>
              {clientTxns.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <Wallet size={28} className="text-fg3" />
                  <p className="font-ui text-[12px] text-fg2">No transactions</p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>REF</th>
                      <th>TYPE</th>
                      <th>AMOUNT</th>
                      <th>STATUS</th>
                      <th>DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientTxns.map(t => (
                      <tr key={t.id}>
                        <td className="mono-cell text-fg3">{t.id}</td>
                        <td className="font-ui text-[12px]">{t.type}</td>
                        <td className="mono-cell">{fmtUSD(t.amount)}</td>
                        <td>
                          <span className={`badge ${
                            t.status === 'Completed' ? 'badge-bull' :
                            t.status === 'Pending' ? 'badge-warn' :
                            t.status === 'Rejected' ? 'badge-bear' : 'badge-muted'
                          }`}>{t.status}</span>
                        </td>
                        <td className="font-ui text-[11px] text-fg3">{t.createdAt.split(' ')[0]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Notes ── */}
          {activeTab === 'notes' && (
            <div className="space-y-3 p-5">
              {client.notes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <StickyNote size={28} className="text-fg3" />
                  <p className="font-ui text-[12px] text-fg2">No notes yet</p>
                </div>
              ) : (
                client.notes.map((note, i) => (
                  <div key={i} className="card p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-ui text-[11px] font-medium text-fg1">{note.author}</span>
                      <span className="font-mono text-[10px] text-fg3">{note.time}</span>
                    </div>
                    <p className="mt-1.5 font-ui text-[12px] text-fg2">{note.text}</p>
                  </div>
                ))
              )}
              <button className="btn btn-ghost btn-sm w-full gap-1.5">
                <StickyNote size={12} /> Add Note
              </button>
            </div>
          )}

          {/* ── KYC ── */}
          {activeTab === 'kyc' && (
            <div className="space-y-3 p-5">
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <span className="font-display text-[11px] font-semibold tracking-widest text-fg3 uppercase">KYC STATUS</span>
                  <span className={kycBadgeClass(client.kyc)}>{client.kyc}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {[
                    { label: 'KYC Level', value: client.kycLevel },
                    { label: 'Expiry Date', value: client.kycExpiry ?? 'Not set' },
                    { label: 'AML Score', value: `${client.amlScore}/100` },
                    { label: 'AML Status', value: client.amlStatus },
                    { label: 'Suitability', value: client.suitability },
                    { label: 'Risk Profile', value: client.riskProfile },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between border-b border-[var(--border)] pb-2 last:border-0">
                      <span className="font-ui text-[11px] text-fg3">{row.label}</span>
                      <span className="font-mono text-[11px] text-fg1">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick KYC actions */}
              {(client.kyc === 'Pending' || client.kyc === 'In Review') && (
                <div className="flex gap-2">
                  <button
                    className="btn btn-bull btn-sm flex-1 gap-1.5"
                    onClick={() => approveKyc(client.id)}
                  >
                    <CheckCircle2 size={12} /> Approve KYC
                  </button>
                  <button
                    className="btn btn-danger btn-sm flex-1 gap-1.5"
                    onClick={() => rejectKyc(client.id)}
                  >
                    <X size={12} /> Reject KYC
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Quick Actions */}
        <div className="flex items-center gap-2 border-t border-[var(--border)] px-5 py-3">
          {client.status !== 'Suspended' ? (
            <>
              {confirmAction === 'suspend' ? (
                <div className="flex w-full items-center gap-2">
                  <span className="flex-1 font-ui text-[11px] text-warn">Suspend {client.name}?</span>
                  <button
                    className="btn btn-danger btn-xs"
                    onClick={() => { suspendClient(client.id); setConfirmAction(null); }}
                  >
                    Confirm
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => setConfirmAction(null)}>Cancel</button>
                </div>
              ) : (
                <button
                  className="btn btn-danger btn-sm gap-1.5"
                  onClick={() => setConfirmAction('suspend')}
                >
                  <Ban size={12} /> Suspend
                </button>
              )}
            </>
          ) : (
            <button
              className="btn btn-bull btn-sm gap-1.5"
              onClick={() => unsuspendClient(client.id)}
            >
              <CheckCircle2 size={12} /> Reinstate
            </button>
          )}
          <button className="btn btn-ghost btn-sm gap-1.5">
            <FileText size={12} /> Statement
          </button>
          <button className="btn btn-ghost btn-sm gap-1.5">
            <AlertTriangle size={12} /> Flag AML
          </button>
        </div>
      </div>
    </>
  );
}

// ─── SORT HEADER ───────────────────────────────────────────────────────────────

function SortTh({
  label, sortKey, current, dir, onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th className="cursor-pointer select-none" onClick={() => onSort(sortKey)}>
      <span className="flex items-center gap-1">
        {label}
        {active
          ? dir === 'asc'
            ? <ChevronUp size={10} className="text-accent" />
            : <ChevronDown size={10} className="text-accent" />
          : <ChevronDown size={10} className="opacity-30" />}
      </span>
    </th>
  );
}

// ─── PAGE ──────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const { clients, isLoading, error, approveKyc, rejectKyc, suspendClient, unsuspendClient } = useClientsApi();
  const [selectedClient, setSelected] = useState<Client | null>(null);
  const { balances } = useAccountBalances(selectedClient?.id ?? null);

  const [search, setSearch]         = useState('');
  const [filterStatus, setStatus]   = useState<ClientStatus | 'All'>('All');
  const [filterType, setType]       = useState<ClientType | 'All'>('All');
  const [filterKyc, setKyc]         = useState<KYCStatus | 'All'>('All');
  const [sortKey, setSortKey]       = useState<SortKey>('volumeMTD');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [selected, setBulk]         = useState<Set<string>>(new Set());

  const handleSort = useCallback((key: SortKey) => {
    setSortDir(prev => key === sortKey ? (prev === 'desc' ? 'asc' : 'desc') : 'desc');
    setSortKey(key);
  }, [sortKey]);

  const filtered = useMemo(() => {
    let list = clients;
    if (search)         list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase()));
    if (filterStatus !== 'All') list = list.filter(c => c.status === filterStatus);
    if (filterType !== 'All')   list = list.filter(c => c.type === filterType);
    if (filterKyc !== 'All')    list = list.filter(c => c.kyc === filterKyc);

    list = [...list].sort((a, b) => {
      const v = (c: Client) => {
        if (sortKey === 'name')      return c.name;
        if (sortKey === 'regDate')   return c.regDate;
        return c[sortKey] as number;
      };
      const av = v(a), bv = v(b);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [clients, search, filterStatus, filterType, filterKyc, sortKey, sortDir]);

  const toggleBulk = useCallback((id: string) => {
    setBulk(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));
  const toggleAll   = () => setBulk(allSelected ? new Set() : new Set(filtered.map(c => c.id)));

  return (
    <>
      <div className="space-y-0">
        {/* Header */}
        <div className="module-header">
          <div>
            <h1 className="module-title">All Clients</h1>
            <p className="module-subtitle">
              {isLoading
                ? 'Loading…'
                : error
                ? <span className="text-[var(--bear)]">{error}</span>
                : `${filtered.length} of ${clients.length} clients shown`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-ui text-[11px] text-fg3">{selected.size} selected</span>
                <button className="btn btn-ghost btn-sm">Export</button>
                <button className="btn btn-ghost btn-sm">Assign IB</button>
                <button className="btn btn-danger btn-sm">Tag</button>
              </div>
            )}
            <button className="btn btn-primary btn-sm gap-1.5">
              <UserPlus size={12} /> New Client
            </button>
            <button className="btn btn-ghost btn-sm gap-1.5">
              <Download size={12} /> Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-6 py-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg3" />
            <input
              className="input input-sm pl-7"
              placeholder="Search name, email, ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <Filter size={12} className="text-fg3" />

          <select
            className="input input-sm w-32"
            value={filterStatus}
            onChange={e => setStatus(e.target.value as ClientStatus | 'All')}
          >
            {['All', 'Active', 'Pending', 'Suspended', 'Dormant'].map(v => <option key={v}>{v}</option>)}
          </select>

          <select
            className="input input-sm w-32"
            value={filterType}
            onChange={e => setType(e.target.value as ClientType | 'All')}
          >
            {['All', 'VIP', 'Pro', 'Retail', 'Institutional'].map(v => <option key={v}>{v}</option>)}
          </select>

          <select
            className="input input-sm w-32"
            value={filterKyc}
            onChange={e => setKyc(e.target.value as KYCStatus | 'All')}
          >
            {['All', 'Verified', 'Pending', 'In Review', 'Rejected', 'Expired'].map(v => <option key={v}>{v}</option>)}
          </select>

          {(search || filterStatus !== 'All' || filterType !== 'All' || filterKyc !== 'All') && (
            <button
              className="btn btn-ghost btn-xs gap-1"
              onClick={() => { setSearch(''); setStatus('All'); setType('All'); setKyc('All'); }}
            >
              <X size={10} /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8 pl-4">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-accent" />
                </th>
                <SortTh label="CLIENT" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th>TYPE</th>
                <th>KYC</th>
                <SortTh label="BALANCE" sortKey="balance" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="EQUITY" sortKey="equity" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="FLOAT P&L" sortKey="floatPnl" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="VOL MTD" sortKey="volumeMTD" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th>STATUS</th>
                <SortTh label="REG DATE" sortKey="regDate" current={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => (
                <tr
                  key={client.id}
                  onClick={() => setSelected(client)}
                  className="cursor-pointer"
                >
                  <td className="pl-4" onClick={e => { e.stopPropagation(); toggleBulk(client.id); }}>
                    <input type="checkbox" checked={selected.has(client.id)} onChange={() => toggleBulk(client.id)} className="accent-accent" />
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">{client.flag}</span>
                      <div>
                        <p className="font-ui text-[12px] font-medium text-fg1">{client.name}</p>
                        <p className="font-mono text-[10px] text-fg3">{client.id}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className={typeBadgeClass(client.type)}>{client.type}</span></td>
                  <td><span className={kycBadgeClass(client.kyc)}>{client.kyc}</span></td>
                  <td className="mono-cell">{fmtUSD(client.balance)}</td>
                  <td className="mono-cell">{fmtUSD(client.equity)}</td>
                  <td>
                    <span className={`font-mono text-[12px] ${pnlClass(client.floatPnl)}`} style={{ fontFeatureSettings: '"tnum" 1' }}>
                      {fmtPnl(client.floatPnl)}
                    </span>
                  </td>
                  <td className="mono-cell">{client.volumeMTD} lots</td>
                  <td><span className={statusBadgeClass(client.status)}>{client.status}</span></td>
                  <td className="font-ui text-[11px] text-fg3">{client.regDate}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Search size={28} className="text-fg3" />
              <p className="font-ui text-[12px] text-fg2">No clients match</p>
              <p className="font-ui text-[11px] text-fg3">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>

      {/* Slide-in Drawer */}
      {selectedClient && (
        <ClientDrawer
          client={selectedClient}
          balances={balances}
          onClose={() => setSelected(null)}
          approveKyc={approveKyc}
          rejectKyc={rejectKyc}
          suspendClient={suspendClient}
          unsuspendClient={unsuspendClient}
        />
      )}
    </>
  );
}
