/**
 * File:        apps/broker-admin/src/app/(admin)/pamm-manager/page.tsx
 * Module:      broker-admin · PAMM/Copy · PAMM Manager
 * Purpose:     PAMM/MAM master account management — AUM, investors, performance, fee config
 *
 * Exports:
 *   - default (PAMMManagerPage) — master account list + drill-down investor view
 *
 * Depends on:
 *   - none (all data is local constants)
 *
 * Side-effects:
 *   - none (read-only in this phase)
 *
 * Key invariants:
 *   - Performance fee is % of profit above high-water mark
 *   - drawdownPct is max drawdown since inception
 *   - Allocation shares sum to ~100% per master (display only — can drift)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Users, ChevronLeft } from 'lucide-react';

type MasterAccount = {
  id: string;
  managerName: string;
  accountId: string;
  strategy: string;
  aum: number;
  investorCount: number;
  mtdReturnPct: number;
  ytdReturnPct: number;
  drawdownPct: number;
  perfFeePct: number;
  mgmtFeePct: number;
  status: 'Active' | 'Closed' | 'Suspended';
  inception: string;
};

type Investor = {
  id: string;
  masterId: string;
  clientName: string;
  clientId: string;
  allocated: number;
  sharePct: number;
  joinDate: string;
  profitSinceJoin: number;
  feesPaid: number;
};

const MASTERS: MasterAccount[] = [
  { id: 'M001', managerName: 'Alexander Mitchell', accountId: 'C1001', strategy: 'EUR/USD Trend',    aum: 2_840_000, investorCount: 14, mtdReturnPct: 4.2,  ytdReturnPct: 18.4, drawdownPct: 6.1,  perfFeePct: 20, mgmtFeePct: 1.5, status: 'Active',    inception: '2023-06-01' },
  { id: 'M002', managerName: 'Wei Zhang',           accountId: 'C1005', strategy: 'Gold Scalper',    aum: 1_120_000, investorCount: 8,  mtdReturnPct: 7.8,  ytdReturnPct: 31.2, drawdownPct: 14.3, perfFeePct: 25, mgmtFeePct: 2.0, status: 'Active',    inception: '2023-09-15' },
  { id: 'M003', managerName: 'Priya Sharma',        accountId: 'C1007', strategy: 'Multi-Asset',     aum: 560_000,   investorCount: 5,  mtdReturnPct: -1.4, ytdReturnPct: 9.8,  drawdownPct: 8.7,  perfFeePct: 15, mgmtFeePct: 1.0, status: 'Active',    inception: '2023-11-01' },
  { id: 'M004', managerName: 'Samuel Okonkwo',      accountId: 'C1015', strategy: 'Crypto Alpha',   aum: 320_000,   investorCount: 3,  mtdReturnPct: 11.2, ytdReturnPct: 42.1, drawdownPct: 28.4, perfFeePct: 30, mgmtFeePct: 2.5, status: 'Suspended', inception: '2024-01-01' },
];

const INVESTORS: Investor[] = [
  { id: 'INV001', masterId: 'M001', clientName: 'Fatima Al-Rashidi', clientId: 'C1002', allocated: 500_000, sharePct: 17.6, joinDate: '2023-07-01', profitSinceJoin: 82_400, feesPaid: 16_480 },
  { id: 'INV002', masterId: 'M001', clientName: 'James Okafor',      clientId: 'C1003', allocated: 200_000, sharePct: 7.0,  joinDate: '2023-08-15', profitSinceJoin: 28_000, feesPaid: 5_600  },
  { id: 'INV003', masterId: 'M001', clientName: 'Lucas Oliveira',    clientId: 'C1006', allocated: 350_000, sharePct: 12.3, joinDate: '2023-06-15', profitSinceJoin: 56_700, feesPaid: 11_340 },
  { id: 'INV004', masterId: 'M002', clientName: 'Anna Kowalski',     clientId: 'C1010', allocated: 150_000, sharePct: 13.4, joinDate: '2023-10-01', profitSinceJoin: 42_300, feesPaid: 10_575 },
  { id: 'INV005', masterId: 'M002', clientName: 'David Thompson',    clientId: 'C1011', allocated: 400_000, sharePct: 35.7, joinDate: '2023-09-15', profitSinceJoin: 98_800, feesPaid: 24_700 },
  { id: 'INV006', masterId: 'M003', clientName: 'Grace Osei',        clientId: 'C1019', allocated: 100_000, sharePct: 17.9, joinDate: '2023-11-15', profitSinceJoin: 7_200,  feesPaid: 1_080  },
];

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function PAMMManagerPage() {
  const [selected, setSelected] = useState<MasterAccount | null>(null);

  if (selected) {
    const investors = INVESTORS.filter(i => i.masterId === selected.id);
    const totalInvested = investors.reduce((s, i) => s + i.allocated, 0);
    const totalProfit   = investors.reduce((s, i) => s + i.profitSinceJoin, 0);
    const totalFees     = investors.reduce((s, i) => s + i.feesPaid, 0);

    return (
      <div className="flex flex-col">
        <div className="module-header">
          <div>
            <p className="module-title">{selected.strategy}</p>
            <p className="module-subtitle">{selected.managerName} · {selected.accountId}</p>
          </div>
          <button className="btn-ghost btn btn-sm" onClick={() => setSelected(null)}>
            <ChevronLeft size={13} /> All PAMM Accounts
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Performance KPIs */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'AUM',         value: fmtUSD(selected.aum),          color: 'text-fg1'   },
              { label: 'MTD Return',  value: `${selected.mtdReturnPct > 0 ? '+' : ''}${selected.mtdReturnPct}%`, color: selected.mtdReturnPct >= 0 ? 'text-bull' : 'text-bear' },
              { label: 'YTD Return',  value: `+${selected.ytdReturnPct}%`,   color: 'text-bull'  },
              { label: 'Max Drawdown',value: `-${selected.drawdownPct}%`,    color: 'text-bear'  },
              { label: 'Perf Fee',    value: `${selected.perfFeePct}%`,      color: 'text-warn'  },
            ].map(k => (
              <div key={k.label} className="kpi-card">
                <p className="kpi-label">{k.label}</p>
                <p className={`kpi-value ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Investor table */}
          <div className="card overflow-x-auto">
            <div className="card-header">
              <p className="card-title">Investor Allocations ({investors.length})</p>
              <p className="text-[11px] text-fg3">
                Total invested: {fmtUSD(totalInvested)} · Total profit: {fmtUSD(totalProfit)} · Total fees: {fmtUSD(totalFees)}
              </p>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Investor</th>
                  <th>Allocated</th>
                  <th>Share %</th>
                  <th>Profit Since Join</th>
                  <th>Fees Paid</th>
                  <th>Join Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {investors.map(inv => (
                  <tr key={inv.id}>
                    <td>
                      <p className="text-[12px] font-medium text-fg1">{inv.clientName}</p>
                      <p className="mono-cell text-[10px] text-fg3">{inv.clientId}</p>
                    </td>
                    <td className="mono-cell font-bold text-[12px] text-fg1">{fmtUSD(inv.allocated)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-[var(--bg-elevated)]">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${inv.sharePct}%` }} />
                        </div>
                        <span className="mono-cell text-[10px] text-fg2">{inv.sharePct}%</span>
                      </div>
                    </td>
                    <td className="mono-cell font-bold text-[12px] text-bull">+{fmtUSD(inv.profitSinceJoin)}</td>
                    <td className="mono-cell text-[11px] text-fg2">{fmtUSD(inv.feesPaid)}</td>
                    <td className="mono-cell text-[10px] text-fg3">{inv.joinDate}</td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn-ghost btn btn-xs">Statement</button>
                        <button className="btn-danger btn btn-xs">Withdraw</button>
                      </div>
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

  const totalAUM = MASTERS.reduce((s, m) => s + m.aum, 0);

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">PAMM Manager</p>
          <p className="module-subtitle">
            {MASTERS.filter(m => m.status === 'Active').length} active masters ·{' '}
            {fmtUSD(totalAUM)} total AUM ·{' '}
            {INVESTORS.length} investors
          </p>
        </div>
        <button className="btn-primary btn btn-sm">+ New Master Account</button>
      </div>

      <div className="p-6 space-y-4">
        {/* Summary KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total AUM',        value: fmtUSD(totalAUM),                                                color: 'text-fg1'   },
            { label: 'Active Masters',   value: MASTERS.filter(m=>m.status==='Active').length,                   color: 'text-bull'  },
            { label: 'Total Investors',  value: INVESTORS.length,                                                color: 'text-accent' },
            { label: 'Avg MTD Return',   value: `+${(MASTERS.filter(m=>m.mtdReturnPct>0).reduce((s,m)=>s+m.mtdReturnPct,0)/MASTERS.length).toFixed(1)}%`, color: 'text-bull' },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <p className="kpi-label">{k.label}</p>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Master accounts grid */}
        <div className="grid grid-cols-2 gap-4">
          {MASTERS.map(m => (
            <div key={m.id}
              className={`card cursor-pointer p-5 transition-colors hover:border-[var(--border-hi)] ${m.status === 'Suspended' ? 'opacity-70' : ''}`}
              onClick={() => setSelected(m)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[13px] font-semibold text-fg1">{m.strategy}</p>
                  <p className="text-[11px] text-fg3">{m.managerName} · {m.accountId}</p>
                </div>
                <span className={m.status === 'Active' ? 'status-active' : m.status === 'Suspended' ? 'status-suspended' : 'badge badge-muted'}>
                  {m.status}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <p className="kpi-label">AUM</p>
                  <p className="mono-cell text-[14px] font-bold text-fg1">{fmtUSD(m.aum)}</p>
                </div>
                <div>
                  <p className="kpi-label">Investors</p>
                  <p className="mono-cell text-[14px] font-bold text-fg1">{m.investorCount}</p>
                </div>
                <div>
                  <p className="kpi-label">MTD</p>
                  <div className="flex items-center gap-1">
                    {m.mtdReturnPct >= 0
                      ? <TrendingUp size={12} className="text-bull" />
                      : <TrendingDown size={12} className="text-bear" />}
                    <p className={`mono-cell text-[14px] font-bold ${m.mtdReturnPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {m.mtdReturnPct > 0 ? '+' : ''}{m.mtdReturnPct}%
                    </p>
                  </div>
                </div>
                <div>
                  <p className="kpi-label">YTD</p>
                  <p className="mono-cell text-[14px] font-bold text-bull">+{m.ytdReturnPct}%</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <div className="flex gap-3 text-fg3">
                  <span>Max DD: <span className="text-bear font-semibold">{m.drawdownPct}%</span></span>
                  <span>Perf: <span className="text-warn font-semibold">{m.perfFeePct}%</span></span>
                  <span>Mgmt: <span className="text-fg2 font-semibold">{m.mgmtFeePct}%</span></span>
                </div>
                <span className="mono-cell text-fg3">Since {m.inception}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
