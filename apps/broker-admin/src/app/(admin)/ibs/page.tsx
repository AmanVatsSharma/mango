/**
 * File:        apps/broker-admin/src/app/(admin)/ibs/page.tsx
 * Module:      broker-admin · Clients · Introducing Brokers
 * Purpose:     IB network management with detail drill-down, commission structure, and client listing
 *
 * Exports:
 *   - default (IBsPage) — IB table with slide-in detail panel
 *
 * Depends on:
 *   - @/lib/mock-data-context — useBrokerData() for ibs, clients
 *
 * Side-effects:
 *   - none (read-only; mutations are UI placeholders)
 *
 * Key invariants:
 *   - Detail view filters clients by their IB assignment (client.ib === ib.id)
 *   - commissionMTD / commissionTotal shown in bull color; pendingPayout in warn
 *   - pendingPayout not commissionPending (matches IntroducingBroker type)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, Users, TrendingUp, DollarSign, Clock } from 'lucide-react';
import { useBrokerData } from '@/lib/mock-data-context';
import type { IntroducingBroker } from '@/lib/types';

const TIER_BADGE: Record<string, string> = {
  Platinum: 'badge badge-accent',
  Gold:     'badge badge-gold',
  Silver:   'badge badge-muted',
  Standard: 'badge badge-muted',
};

const STATUS_BADGE: Record<string, string> = {
  Active:    'status-active',
  Pending:   'status-pending',
  Suspended: 'status-suspended',
};

// ─── COMMISSION STRUCTURE SVG ─────────────────────────────────────────────────
function CommissionStructureDiagram() {
  return (
    <div className="rounded-r-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 mb-4">
      <p className="kpi-label mb-3">Commission Structure</p>
      <svg width="100%" viewBox="0 0 480 130" className="overflow-visible">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M2 2L8 5L2 8" fill="none" stroke="#4A5568" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        <rect x="160" y="8" width="160" height="44" rx="6" fill="rgba(59,130,246,0.08)" stroke="rgba(59,130,246,0.4)" strokeWidth="1" />
        <text x="240" y="26" textAnchor="middle" fontSize="11" fontWeight="600" fill="#E2E8F0" fontFamily="DM Sans, sans-serif">Tier 1 IB</text>
        <text x="240" y="42" textAnchor="middle" fontSize="9" fill="#3B82F6" fontFamily="IBM Plex Mono, monospace">$6–$8 per lot</text>
        <line x1="200" y1="52" x2="80" y2="96" stroke="#2E3847" strokeWidth="1" markerEnd="url(#arr)" />
        <line x1="240" y1="52" x2="240" y2="96" stroke="#2E3847" strokeWidth="1" markerEnd="url(#arr)" />
        <line x1="280" y1="52" x2="400" y2="96" stroke="#2E3847" strokeWidth="1" markerEnd="url(#arr)" />
        <text x="130" y="78" textAnchor="middle" fontSize="8" fill="#4A5568" fontFamily="DM Sans, sans-serif">refers</text>
        <text x="240" y="78" textAnchor="middle" fontSize="8" fill="#4A5568" fontFamily="DM Sans, sans-serif">refers</text>
        <text x="346" y="78" textAnchor="middle" fontSize="8" fill="#4A5568" fontFamily="DM Sans, sans-serif">sub-IB</text>
        <rect x="20" y="96" width="120" height="30" rx="5" fill="rgba(16,217,150,0.08)" stroke="rgba(16,217,150,0.4)" strokeWidth="1" />
        <text x="80" y="115" textAnchor="middle" fontSize="9" fill="#10D996" fontFamily="DM Sans, sans-serif">Clients · Volume</text>
        <rect x="180" y="96" width="120" height="30" rx="5" fill="rgba(16,217,150,0.08)" stroke="rgba(16,217,150,0.4)" strokeWidth="1" />
        <text x="240" y="115" textAnchor="middle" fontSize="9" fill="#10D996" fontFamily="DM Sans, sans-serif">Clients · Volume</text>
        <rect x="340" y="96" width="120" height="30" rx="5" fill="rgba(245,158,11,0.08)" stroke="rgba(245,158,11,0.4)" strokeWidth="1" />
        <text x="400" y="115" textAnchor="middle" fontSize="9" fill="#F59E0B" fontFamily="DM Sans, sans-serif">Tier 2 IB · 50% rate</text>
      </svg>
    </div>
  );
}

// ─── IB DETAIL PANEL ─────────────────────────────────────────────────────────
function IBDetail({ ib, onBack }: { ib: IntroducingBroker; onBack: () => void }) {
  const { clients } = useBrokerData();
  const [tab, setTab] = useState<'profile' | 'clients' | 'commissions'>('profile');
  const ibClients = useMemo(() => clients.filter(c => c.ib === ib.id), [clients, ib.id]);

  const stats = [
    { label: 'Clients',        value: ib.clientCount,                          icon: <Users size={14} />,      color: 'text-accent' },
    { label: 'Volume MTD',     value: `${ib.volumeMTD.toLocaleString()} lots`, icon: <TrendingUp size={14} />, color: 'text-fg1'   },
    { label: 'Commission MTD', value: `$${ib.commissionMTD.toLocaleString()}`, icon: <DollarSign size={14} />, color: 'text-bull'  },
    { label: 'Pending Payout', value: `$${ib.pendingPayout.toLocaleString()}`, icon: <Clock size={14} />,      color: 'text-warn'  },
  ];

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div className="flex items-center gap-3">
          <button className="btn-ghost btn btn-sm" onClick={onBack}>
            <ChevronLeft size={13} /> All IBs
          </button>
          <div className="h-4 w-px bg-[var(--border)]" />
          <div>
            <p className="module-title">{ib.name}</p>
            <p className="module-subtitle">{ib.flag} {ib.country} · {ib.email}</p>
          </div>
          <span className={STATUS_BADGE[ib.status] ?? 'badge badge-muted'}>{ib.status}</span>
        </div>
        <button className="btn-primary btn btn-sm">
          <DollarSign size={13} /> Pay ${ib.pendingPayout.toLocaleString()}
        </button>
      </div>

      <div className="p-6">
        {/* KPI strip */}
        <div className="mb-5 grid grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="kpi-card">
              <p className="kpi-label">{s.label}</p>
              <p className={`kpi-value ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="chart-tabs mb-4">
          {(['profile', 'clients', 'commissions'] as const).map(t => (
            <button key={t} className={`chart-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <p className="kpi-label mb-3">Profile</p>
              {[
                ['IB ID',        ib.id],
                ['Tier',         ib.tier],
                ['Commission',   `$${ib.commissionRate} / lot`],
                ['Total Earned', `$${ib.commissionTotal.toLocaleString()}`],
                ['Registered',   ib.regDate],
                ['Last Payout',  ib.lastPayout],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between border-b border-[var(--border)] py-1.5 last:border-0">
                  <span className="text-[11px] text-fg3">{l}</span>
                  <span className="mono-cell text-[11px] text-fg1">{v}</span>
                </div>
              ))}
            </div>
            <CommissionStructureDiagram />
          </div>
        )}

        {tab === 'clients' && (
          <div className="card overflow-x-auto">
            {ibClients.length === 0 ? (
              <p className="py-12 text-center text-[12px] text-fg3">No clients assigned to this IB in mock data</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Type</th>
                    <th>KYC</th>
                    <th>Balance</th>
                    <th>Volume MTD</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ibClients.map(c => (
                    <tr key={c.id}>
                      <td>
                        <p className="text-[12px] font-medium text-fg1">{c.name}</p>
                        <p className="mono-cell text-[10px] text-fg3">{c.id}</p>
                      </td>
                      <td><span className={`type-${c.type.toLowerCase().replace(' ', '')}`}>{c.type}</span></td>
                      <td><span className={`kyc-${c.kyc.toLowerCase()}`}>{c.kyc}</span></td>
                      <td className="delta-positive mono-cell">${c.balance.toLocaleString()}</td>
                      <td className="mono-cell text-[11px] text-fg2">{c.volumeMTD.toLocaleString()}</td>
                      <td><span className={`status-${c.status.toLowerCase()}`}>{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'commissions' && (
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>Period</th><th>Volume (lots)</th><th>Rate</th><th>Commission</th><th>Status</th></tr>
              </thead>
              <tbody>
                {[
                  { period: 'Jan 2024', vol: ib.volumeMTD, amt: ib.commissionMTD, status: 'Pending' },
                  { period: 'Dec 2023', vol: Math.floor(ib.volumeMTD * 0.9), amt: Math.floor(ib.commissionMTD * 0.85), status: 'Paid' },
                  { period: 'Nov 2023', vol: Math.floor(ib.volumeMTD * 0.8), amt: Math.floor(ib.commissionMTD * 0.75), status: 'Paid' },
                ].map(row => (
                  <tr key={row.period}>
                    <td className="mono-cell text-[11px]">{row.period}</td>
                    <td className="mono-cell text-[11px] text-fg2">{row.vol.toLocaleString()}</td>
                    <td className="mono-cell text-[11px] text-fg2">${ib.commissionRate}/lot</td>
                    <td className={`mono-cell font-bold text-[12px] ${row.status === 'Pending' ? 'text-warn' : 'text-bull'}`}>
                      ${row.amt.toLocaleString()}
                    </td>
                    <td>
                      <span className={row.status === 'Paid' ? 'status-active' : 'status-pending'}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── IBS LIST ─────────────────────────────────────────────────────────────────
export default function IBsPage() {
  const { ibs } = useBrokerData();
  const [selected, setSelected] = useState<IntroducingBroker | null>(null);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('All');

  if (selected) return <IBDetail ib={selected} onBack={() => setSelected(null)} />;

  const tiers = ['All', 'Platinum', 'Gold', 'Silver', 'Standard'];
  const filtered = useMemo(() =>
    ibs.filter(ib =>
      (tierFilter === 'All' || ib.tier === tierFilter) &&
      (!search || ib.name.toLowerCase().includes(search.toLowerCase()) || ib.country.toLowerCase().includes(search.toLowerCase()))
    ), [ibs, tierFilter, search]
  );

  const totalPending = ibs.reduce((s, ib) => s + ib.pendingPayout, 0);

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Introducing Brokers</p>
          <p className="module-subtitle">
            {ibs.filter(i => i.status === 'Active').length} active ·{' '}
            <span className="text-warn">${totalPending.toLocaleString()} pending payout</span>
          </p>
        </div>
        <button className="btn-primary btn btn-sm"><Users size={13} /> Add IB</button>
      </div>

      <div className="p-6">
        {/* Summary strip */}
        <div className="mb-5 grid grid-cols-4 gap-3">
          {[
            { label: 'Total IBs',       value: ibs.length,                                        color: 'text-fg1'    },
            { label: 'Active IBs',      value: ibs.filter(i => i.status === 'Active').length,     color: 'text-bull'   },
            { label: 'Total Volume MTD',value: `${ibs.reduce((s,i) => s+i.volumeMTD, 0).toLocaleString()} lots`, color: 'text-fg1' },
            { label: 'Pending Payout',  value: `$${totalPending.toLocaleString()}`,                color: 'text-warn'   },
          ].map(s => (
            <div key={s.label} className="kpi-card">
              <p className="kpi-label">{s.label}</p>
              <p className={`kpi-value ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-3">
          <input className="input w-60" placeholder="Search by name or country..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="chart-tabs">
            {tiers.map(t => (
              <button key={t} className={`chart-tab ${tierFilter === t ? 'active' : ''}`} onClick={() => setTierFilter(t)}>{t}</button>
            ))}
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>IB</th>
                <th>Tier</th>
                <th>Clients</th>
                <th>Volume MTD</th>
                <th>Commission MTD</th>
                <th>Total Earned</th>
                <th>Pending Payout</th>
                <th>Rate</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ib => (
                <tr key={ib.id} className="cursor-pointer" onClick={() => setSelected(ib)}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{ib.flag}</span>
                      <div>
                        <p className="text-[12px] font-medium text-fg1">{ib.name}</p>
                        <p className="mono-cell text-[10px] text-fg3">{ib.id} · {ib.country}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className={TIER_BADGE[ib.tier] ?? 'badge badge-muted'}>{ib.tier}</span></td>
                  <td className="mono-cell text-[12px] text-fg1">{ib.clientCount}</td>
                  <td className="mono-cell text-[12px] text-fg2">{ib.volumeMTD.toLocaleString()}</td>
                  <td className="delta-positive mono-cell">${ib.commissionMTD.toLocaleString()}</td>
                  <td className="delta-positive mono-cell">${ib.commissionTotal.toLocaleString()}</td>
                  <td className="mono-cell font-bold text-warn">${ib.pendingPayout.toLocaleString()}</td>
                  <td className="mono-cell text-[11px] text-fg2">${ib.commissionRate}/lot</td>
                  <td><span className={STATUS_BADGE[ib.status] ?? 'badge badge-muted'}>{ib.status}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn-ghost btn btn-xs" onClick={() => setSelected(ib)}>Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
