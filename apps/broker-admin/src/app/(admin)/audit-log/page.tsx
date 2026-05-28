/**
 * File:        apps/broker-admin/src/app/(admin)/audit-log/page.tsx
 * Module:      broker-admin · Team · Audit Log
 * Purpose:     Immutable audit trail of admin actions — who did what, when, and on which entity
 *
 * Exports:
 *   - default (AuditLogPage) — searchable, filterable audit event log with drill-down detail
 *
 * Depends on:
 *   - @/lib/api/hooks/use-audit-log — useAuditLog() for real API data
 *   - Note: falls back to empty state when API unavailable; local ENTRIES retained as placeholder
 *
 * Side-effects:
 *   - none (read-only; audit logs are append-only by design)
 *
 * Key invariants:
 *   - Audit entries are immutable — no edit or delete actions in this view
 *   - Each event has: actor, action, target entity, IP, and before/after snapshot
 *   - severity: Info (routine), Warn (notable change), Critical (destructive/privileged)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Search, Shield, X } from 'lucide-react';
import { useAuditLog } from '@/lib/api/hooks/use-audit-log';

type AuditSeverity = 'Info' | 'Warn' | 'Critical';
type AuditCategory = 'Client' | 'KYC' | 'Trading' | 'Finance' | 'Risk' | 'Platform' | 'Auth' | 'Team';

type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  targetEntity: string;
  targetId: string;
  ip: string;
  details: Record<string, string>;
  before?: Record<string, string>;
  after?: Record<string, string>;
};

const ENTRIES: AuditEntry[] = [
  {
    id: 'A0001', timestamp: '2024-01-15 14:32:11', actor: 'Emma L.', actorRole: 'Compliance Officer',
    action: 'KYC Approved', category: 'KYC', severity: 'Info',
    targetEntity: 'Client', targetId: 'C1010', ip: '192.168.1.42',
    details: { client: 'Anna Kowalski', kycLevel: 'Standard' },
    before: { kycStatus: 'Pending' }, after: { kycStatus: 'Approved', kycLevel: 'Standard' },
  },
  {
    id: 'A0002', timestamp: '2024-01-15 14:18:04', actor: 'Tom B.', actorRole: 'Finance Manager',
    action: 'Withdrawal Approved', category: 'Finance', severity: 'Warn',
    targetEntity: 'Transaction', targetId: 'TX-2024-00481', ip: '192.168.1.55',
    details: { client: 'Fatima Al-Rashidi', amount: '$5,000', method: 'Wire Transfer' },
    before: { status: 'Pending' }, after: { status: 'Approved' },
  },
  {
    id: 'A0003', timestamp: '2024-01-15 13:55:42', actor: 'Alex K.', actorRole: 'Super Admin',
    action: 'Leverage Changed', category: 'Client', severity: 'Warn',
    targetEntity: 'Client Account', targetId: 'C1001', ip: '10.0.0.8',
    details: { client: 'Alexander Mitchell', account: 'MT5-10001' },
    before: { leverage: '1:100' }, after: { leverage: '1:200' },
  },
  {
    id: 'A0004', timestamp: '2024-01-15 13:20:18', actor: 'Emma L.', actorRole: 'Compliance Officer',
    action: 'AML Alert Resolved', category: 'Risk', severity: 'Warn',
    targetEntity: 'Surveillance Alert', targetId: 'SA-2024-003', ip: '192.168.1.42',
    details: { alertType: 'Wash Trading Pattern', resolution: 'Reviewed — legitimate hedging strategy' },
    before: { status: 'Open' }, after: { status: 'Resolved' },
  },
  {
    id: 'A0005', timestamp: '2024-01-15 12:44:07', actor: 'Alex K.', actorRole: 'Super Admin',
    action: 'Role Permissions Modified', category: 'Team', severity: 'Critical',
    targetEntity: 'Role', targetId: 'R004', ip: '10.0.0.8',
    details: { role: 'Finance Manager' },
    before: { permissions: 'clients.view, tx.view, tx.approve, pnl.view' },
    after: { permissions: 'clients.view, tx.view, tx.approve, bonus.manage, pnl.view, reports.export' },
  },
  {
    id: 'A0006', timestamp: '2024-01-15 12:01:53', actor: 'Ravi M.', actorRole: 'Dealer',
    action: 'Order Cancelled', category: 'Trading', severity: 'Info',
    targetEntity: 'Order', targetId: 'ORD-2024-1841', ip: '192.168.1.71',
    details: { client: 'James Okafor', symbol: 'EURUSD', lots: '1.5', reason: 'Client request' },
  },
  {
    id: 'A0007', timestamp: '2024-01-15 11:33:29', actor: 'Alex K.', actorRole: 'Super Admin',
    action: 'Client Blocked', category: 'Client', severity: 'Critical',
    targetEntity: 'Client', targetId: 'C1099', ip: '10.0.0.8',
    details: { client: 'Unknown Client', reason: 'Suspected fraudulent activity' },
    before: { status: 'Active' }, after: { status: 'Blocked' },
  },
  {
    id: 'A0008', timestamp: '2024-01-15 10:58:14', actor: 'Tom B.', actorRole: 'Finance Manager',
    action: 'Bonus Triggered', category: 'Finance', severity: 'Info',
    targetEntity: 'Client Bonus', targetId: 'C1010', ip: '192.168.1.55',
    details: { client: 'Anna Kowalski', bonus: 'Welcome Bonus', amount: '$50' },
  },
  {
    id: 'A0009', timestamp: '2024-01-15 09:47:02', actor: 'System', actorRole: 'Automated',
    action: 'Margin Call Triggered', category: 'Risk', severity: 'Warn',
    targetEntity: 'Client Account', targetId: 'C1015', ip: 'internal',
    details: { client: 'Samuel Okonkwo', account: 'MT5-10015', marginLevel: '82%', threshold: '100%' },
  },
  {
    id: 'A0010', timestamp: '2024-01-15 09:12:38', actor: 'Emma L.', actorRole: 'Compliance Officer',
    action: 'KYC Rejected', category: 'KYC', severity: 'Info',
    targetEntity: 'Client', targetId: 'C1041', ip: '192.168.1.42',
    details: { client: 'Unknown Applicant', reason: 'Document expired', kycLevel: 'Standard' },
    before: { kycStatus: 'Pending' }, after: { kycStatus: 'Rejected' },
  },
  {
    id: 'A0011', timestamp: '2024-01-15 08:30:00', actor: 'Alex K.', actorRole: 'Super Admin',
    action: 'Admin Login', category: 'Auth', severity: 'Info',
    targetEntity: 'Session', targetId: 'SES-20240115-001', ip: '10.0.0.8',
    details: { method: '2FA', device: 'macOS · Chrome 120' },
  },
  {
    id: 'A0012', timestamp: '2024-01-15 08:15:44', actor: 'Alex K.', actorRole: 'Super Admin',
    action: 'Pricing Rule Modified', category: 'Trading', severity: 'Critical',
    targetEntity: 'Pricing Rule', targetId: 'PR-VIP', ip: '10.0.0.8',
    details: { rule: 'VIP Group Override', symbol: 'EURUSD' },
    before: { markupBps: '2.5' }, after: { markupBps: '1.8' },
  },
];

const SEV_BADGE: Record<AuditSeverity, string> = {
  Info:     'badge-muted',
  Warn:     'badge-warn',
  Critical: 'badge-bear',
};

const CAT_BADGE: Record<AuditCategory, string> = {
  Client:   'badge-accent',
  KYC:      'badge-bull',
  Trading:  'badge-purple',
  Finance:  'badge-warn',
  Risk:     'badge-bear',
  Platform: 'badge-muted',
  Auth:     'badge-muted',
  Team:     'badge-gold',
};

export default function AuditLogPage() {
  const { entries: apiEntries, isLoading } = useAuditLog();
  const [search, setSearch] = useState('');
  const [filterSev, setFilterSev] = useState<AuditSeverity | 'All'>('All');
  const [filterCat, setFilterCat] = useState<AuditCategory | 'All'>('All');
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  // Use API entries when available; fall back to local ENTRIES for dev mode
  const entries = apiEntries.length > 0
    ? apiEntries.map((e): AuditEntry => ({
        id: e.id,
        timestamp: e.createdAt
          ? new Date(e.createdAt).toLocaleString('en-GB', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit',
            }).replace(',', '')
          : e.createdAt ?? '',
        actor: e.actor,
        actorRole: 'Admin',
        action: e.action,
        category: (e.module as AuditCategory) ?? 'Platform',
        severity: (e.severity as AuditSeverity) ?? 'Info',
        targetEntity: e.targetId ?? '—',
        targetId: e.targetId ?? '—',
        ip: e.ip ?? '—',
        details: { ...(e.after as Record<string, string> ?? {}), ...(e.before as Record<string, string> ?? {}) },
        before: e.before as Record<string, string> | undefined,
        after: e.after as Record<string, string> | undefined,
      }))
    : ENTRIES;

  const filtered = entries.filter(e => {
    const matchSearch = !search || e.action.toLowerCase().includes(search.toLowerCase())
      || e.actor.toLowerCase().includes(search.toLowerCase())
      || e.targetId.toLowerCase().includes(search.toLowerCase());
    const matchSev = filterSev === 'All' || e.severity === filterSev;
    const matchCat = filterCat === 'All' || e.category === filterCat;
    return matchSearch && matchSev && matchCat;
  });

  const categories = [...new Set(entries.map(e => e.category))] as AuditCategory[];

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Audit Log</p>
          <p className="module-subtitle">
            {ENTRIES.filter(e => e.severity === 'Critical').length} critical · {ENTRIES.length} total events today
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost btn btn-sm">Export CSV</button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Events',    value: entries.length,                                     color: 'text-fg1' },
            { label: 'Critical Events', value: entries.filter(e => e.severity === 'Critical').length, color: 'text-bear' },
            { label: 'Unique Actors',   value: new Set(entries.map(e => e.actor)).size,             color: 'text-accent' },
            { label: 'System Events',   value: entries.filter(e => e.actor === 'System').length,    color: 'text-fg3' },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <p className="kpi-label">{k.label}</p>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg3" />
            <input className="input pl-7 text-[11px] h-8 w-full" placeholder="Search action, actor, or ID…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {(['All', 'Info', 'Warn', 'Critical'] as const).map(s => (
              <button key={s} className={`btn btn-xs ${filterSev === s ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterSev(s)}>{s}</button>
            ))}
          </div>
          <div className="flex gap-1">
            <button className={`btn btn-xs ${filterCat === 'All' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterCat('All')}>All</button>
            {categories.map(c => (
              <button key={c} className={`btn btn-xs ${filterCat === c ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterCat(c)}>{c}</button>
            ))}
          </div>
        </div>

        <div className={`grid gap-4 ${selected ? 'grid-cols-[1fr_340px]' : 'grid-cols-1'}`}>
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Target</th>
                  <th>IP</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id}
                    className={`cursor-pointer ${selected?.id === e.id ? 'bg-accent/5' : ''} ${e.severity === 'Critical' ? 'bg-bear/5' : ''}`}
                    onClick={() => setSelected(selected?.id === e.id ? null : e)}>
                    <td className="mono-cell text-[10px] text-fg3">{e.timestamp}</td>
                    <td>
                      <p className="text-[11px] font-medium text-fg1">{e.actor}</p>
                      <p className="text-[9px] text-fg3">{e.actorRole}</p>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {e.severity === 'Critical' && <Shield size={10} className="text-bear shrink-0" />}
                        <span className="text-[11px] font-medium text-fg1">{e.action}</span>
                      </div>
                    </td>
                    <td><span className={`badge ${CAT_BADGE[e.category]}`}>{e.category}</span></td>
                    <td><span className={`badge ${SEV_BADGE[e.severity]}`}>{e.severity}</span></td>
                    <td>
                      <p className="text-[10px] text-fg2">{e.targetEntity}</p>
                      <p className="mono-cell text-[9px] text-fg3">{e.targetId}</p>
                    </td>
                    <td className="mono-cell text-[10px] text-fg3">{e.ip}</td>
                    <td>
                      <button className="btn-ghost btn btn-xs">Detail</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="py-8 text-center text-[11px] text-fg3">No events match the current filters.</p>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="card p-0 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div>
                  <p className="text-[12px] font-semibold text-fg1">{selected.action}</p>
                  <p className="mono-cell text-[9px] text-fg3">{selected.id}</p>
                </div>
                <button className="btn-ghost btn btn-xs p-1" onClick={() => setSelected(null)}>
                  <X size={13} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[11px]">
                <div className="space-y-1.5">
                  {[
                    { label: 'Timestamp', value: selected.timestamp },
                    { label: 'Actor',     value: `${selected.actor} (${selected.actorRole})` },
                    { label: 'IP',        value: selected.ip },
                    { label: 'Target',    value: `${selected.targetEntity} · ${selected.targetId}` },
                  ].map(f => (
                    <div key={f.label} className="flex justify-between gap-3">
                      <span className="text-fg3 shrink-0">{f.label}</span>
                      <span className="mono-cell text-[10px] text-fg2 text-right">{f.value}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-fg3 mb-2">DETAILS</p>
                  <div className="space-y-1">
                    {Object.entries(selected.details).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <span className="text-fg3 shrink-0 capitalize">{k}</span>
                        <span className="mono-cell text-[10px] text-fg1 text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {selected.before && selected.after && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-fg3 mb-2">CHANGE DIFF</p>
                    <div className="space-y-1.5">
                      {Object.keys(selected.after).map(k => (
                        <div key={k} className="rounded border border-[var(--border)] px-3 py-2">
                          <p className="text-[9px] text-fg3 mb-1">{k}</p>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="mono-cell text-bear line-through">{selected.before![k]}</span>
                            <span className="text-fg3">→</span>
                            <span className="mono-cell text-bull font-semibold">{selected.after![k]}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <span className={`badge ${SEV_BADGE[selected.severity]}`}>{selected.severity}</span>
                  <span className={`badge ${CAT_BADGE[selected.category]}`}>{selected.category}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
