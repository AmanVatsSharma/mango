/**
 * File:        apps/broker-admin/src/app/(admin)/copy-trading/page.tsx
 * Module:      broker-admin · PAMM/Copy · Copy Trading
 * Purpose:     Signal provider management and copy subscriber monitoring
 *
 * Exports:
 *   - default (CopyTradingPage) — two tabs: Providers | Subscribers
 *
 * Depends on:
 *   - none (all data is local constants)
 *
 * Side-effects:
 *   - none (read-only)
 *
 * Key invariants:
 *   - Provider ranking by combined score of win rate + follower count + monthly return
 *   - Subscriber lotMultiplier: 0.1 = copy 10% of provider's lot size
 *   - riskMode: 'Fixed' copies exact lots; 'Proportional' scales by equity ratio
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { TrendingUp, Users, Star, Shield } from 'lucide-react';

type Provider = {
  id: string;
  name: string;
  clientId: string;
  strategy: string;
  winRatePct: number;
  monthlyReturnPct: number;
  maxDDPct: number;
  followers: number;
  copiedAUM: number;
  totalTrades: number;
  sharpeRatio: number;
  status: 'Active' | 'Paused' | 'Banned';
  verified: boolean;
};

type Subscriber = {
  id: string;
  clientName: string;
  clientId: string;
  providerId: string;
  allocatedAmount: number;
  lotMultiplier: number;
  riskMode: 'Fixed' | 'Proportional';
  profitSinceFollow: number;
  followSince: string;
  status: 'Active' | 'Paused';
};

const PROVIDERS: Provider[] = [
  { id: 'P001', name: 'Alexander Mitchell', clientId: 'C1001', strategy: 'EUR/USD Precision', winRatePct: 74, monthlyReturnPct: 4.2,  maxDDPct: 6.1,  followers: 48, copiedAUM: 1_840_000, totalTrades: 812,  sharpeRatio: 2.1, status: 'Active', verified: true  },
  { id: 'P002', name: 'Wei Zhang',           clientId: 'C1005', strategy: 'Gold Momentum',    winRatePct: 81, monthlyReturnPct: 7.8,  maxDDPct: 14.3, followers: 31, copiedAUM: 980_000,  totalTrades: 420,  sharpeRatio: 1.8, status: 'Active', verified: true  },
  { id: 'P003', name: 'Samuel Okonkwo',      clientId: 'C1015', strategy: 'Crypto Swing',     winRatePct: 68, monthlyReturnPct: 11.2, maxDDPct: 28.4, followers: 15, copiedAUM: 320_000,  totalTrades: 295,  sharpeRatio: 1.2, status: 'Paused', verified: false },
  { id: 'P004', name: 'Priya Sharma',        clientId: 'C1007', strategy: 'Low-Risk Diversified', winRatePct: 71, monthlyReturnPct: 2.1, maxDDPct: 4.8, followers: 22, copiedAUM: 620_000, totalTrades: 1240, sharpeRatio: 2.4, status: 'Active', verified: true  },
];

const SUBSCRIBERS: Subscriber[] = [
  { id: 'S001', clientName: 'Fatima Al-Rashidi', clientId: 'C1002', providerId: 'P001', allocatedAmount: 10_000, lotMultiplier: 0.5, riskMode: 'Proportional', profitSinceFollow: 3_240, followSince: '2023-09-01', status: 'Active' },
  { id: 'S002', clientName: 'James Okafor',      clientId: 'C1003', providerId: 'P001', allocatedAmount: 5_000,  lotMultiplier: 0.3, riskMode: 'Fixed',         profitSinceFollow: 1_840, followSince: '2023-10-15', status: 'Active' },
  { id: 'S003', clientName: 'Anna Kowalski',     clientId: 'C1010', providerId: 'P002', allocatedAmount: 8_000,  lotMultiplier: 0.4, riskMode: 'Proportional', profitSinceFollow: 4_120, followSince: '2023-09-15', status: 'Active' },
  { id: 'S004', clientName: 'Grace Osei',        clientId: 'C1019', providerId: 'P003', allocatedAmount: 2_000,  lotMultiplier: 0.2, riskMode: 'Fixed',         profitSinceFollow: -280,  followSince: '2024-01-01', status: 'Paused' },
  { id: 'S005', clientName: 'David Thompson',    clientId: 'C1011', providerId: 'P004', allocatedAmount: 15_000, lotMultiplier: 1.0, riskMode: 'Proportional', profitSinceFollow: 1_890, followSince: '2023-11-01', status: 'Active' },
];

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function ProviderRankBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-16 rounded-full bg-[var(--bg-elevated)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
      </div>
      <span className="mono-cell text-[10px] text-fg3">{value}</span>
    </div>
  );
}

export default function CopyTradingPage() {
  const [tab, setTab] = useState<'providers' | 'subscribers'>('providers');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const providerName = (id: string) => PROVIDERS.find(p => p.id === id)?.name ?? id;
  const displayedSubs = selectedProvider
    ? SUBSCRIBERS.filter(s => s.providerId === selectedProvider)
    : SUBSCRIBERS;

  const totalFollowers = PROVIDERS.reduce((s, p) => s + p.followers, 0);
  const totalAUM = PROVIDERS.reduce((s, p) => s + p.copiedAUM, 0);

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Copy Trading</p>
          <p className="module-subtitle">
            {PROVIDERS.filter(p=>p.status==='Active').length} active providers ·{' '}
            {totalFollowers} followers · {fmtUSD(totalAUM)} copied AUM
          </p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Active Providers', value: PROVIDERS.filter(p=>p.status==='Active').length,  color: 'text-bull',   icon: <TrendingUp size={14} className="text-bull" /> },
            { label: 'Total Followers',  value: totalFollowers,                                    color: 'text-accent', icon: <Users size={14} className="text-accent" /> },
            { label: 'Copied AUM',       value: fmtUSD(totalAUM),                                 color: 'text-fg1',    icon: <Shield size={14} className="text-fg3" /> },
            { label: 'Top Win Rate',     value: `${Math.max(...PROVIDERS.map(p=>p.winRatePct))}%`, color: 'text-bull',  icon: <Star size={14} className="text-gold" /> },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <div className="flex items-center justify-between"><p className="kpi-label">{k.label}</p>{k.icon}</div>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        <div className="chart-tabs">
          <button className={`chart-tab ${tab === 'providers' ? 'active' : ''}`} onClick={() => setTab('providers')}>
            Signal Providers <span className="ml-1 font-mono text-[9px] text-fg3">{PROVIDERS.length}</span>
          </button>
          <button className={`chart-tab ${tab === 'subscribers' ? 'active' : ''}`} onClick={() => setTab('subscribers')}>
            Subscribers <span className="ml-1 font-mono text-[9px] text-fg3">{SUBSCRIBERS.length}</span>
          </button>
        </div>

        {/* Providers */}
        {tab === 'providers' && (
          <div className="grid grid-cols-2 gap-4">
            {PROVIDERS.map(p => (
              <div key={p.id} className={`card p-5 ${p.status !== 'Active' ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-semibold text-fg1">{p.name}</p>
                      {p.verified && <span className="badge badge-bull text-[8px]">Verified</span>}
                    </div>
                    <p className="text-[11px] text-fg3">{p.strategy} · {p.clientId}</p>
                  </div>
                  <span className={p.status === 'Active' ? 'status-active' : p.status === 'Paused' ? 'status-pending' : 'status-suspended'}>
                    {p.status}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { label: 'Win Rate',   value: `${p.winRatePct}%`,           color: p.winRatePct >= 75 ? 'text-bull' : p.winRatePct >= 60 ? 'text-accent' : 'text-warn' },
                    { label: 'Monthly',    value: `+${p.monthlyReturnPct}%`,     color: 'text-bull'  },
                    { label: 'Max DD',     value: `-${p.maxDDPct}%`,             color: p.maxDDPct > 20 ? 'text-bear' : p.maxDDPct > 10 ? 'text-warn' : 'text-fg2' },
                    { label: 'Sharpe',     value: p.sharpeRatio.toFixed(1),      color: p.sharpeRatio >= 2 ? 'text-bull' : 'text-fg2' },
                  ].map(m => (
                    <div key={m.label}>
                      <p className="kpi-label">{m.label}</p>
                      <p className={`mono-cell text-[13px] font-bold ${m.color}`}>{m.value}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-[var(--border)] pt-3 flex items-center justify-between text-[11px]">
                  <div className="flex gap-3 text-fg3">
                    <span><Users size={10} className="inline mr-0.5" />{p.followers} followers</span>
                    <span>{fmtUSD(p.copiedAUM)} copied</span>
                    <span>{p.totalTrades} trades</span>
                  </div>
                  <button className="btn-ghost btn btn-xs"
                    onClick={() => { setSelectedProvider(p.id); setTab('subscribers'); }}>
                    View Subs
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Subscribers */}
        {tab === 'subscribers' && (
          <div className="space-y-3">
            {selectedProvider && (
              <div className="flex items-center gap-2">
                <p className="text-[11px] text-fg2">Showing subscribers of <strong className="text-fg1">{providerName(selectedProvider)}</strong></p>
                <button className="btn-ghost btn btn-xs" onClick={() => setSelectedProvider(null)}>Show all</button>
              </div>
            )}
            <div className="card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Subscriber</th>
                    <th>Provider</th>
                    <th>Allocated</th>
                    <th>Lot Multiplier</th>
                    <th>Risk Mode</th>
                    <th>Profit Since Follow</th>
                    <th>Follow Date</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSubs.map(s => (
                    <tr key={s.id}>
                      <td>
                        <p className="text-[12px] font-medium text-fg1">{s.clientName}</p>
                        <p className="mono-cell text-[10px] text-fg3">{s.clientId}</p>
                      </td>
                      <td className="text-[11px] text-fg2">{providerName(s.providerId)}</td>
                      <td className="mono-cell font-bold text-[12px] text-fg1">{fmtUSD(s.allocatedAmount)}</td>
                      <td className="mono-cell text-[11px] text-accent">{s.lotMultiplier}×</td>
                      <td><span className="badge badge-muted">{s.riskMode}</span></td>
                      <td className={`mono-cell font-bold text-[12px] ${s.profitSinceFollow >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {s.profitSinceFollow >= 0 ? '+' : ''}{fmtUSD(s.profitSinceFollow)}
                      </td>
                      <td className="mono-cell text-[10px] text-fg3">{s.followSince}</td>
                      <td><span className={s.status === 'Active' ? 'status-active' : 'status-pending'}>{s.status}</span></td>
                      <td>
                        <div className="flex gap-1">
                          <button className="btn-ghost btn btn-xs">Edit</button>
                          <button className="btn-danger btn btn-xs">Stop</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
