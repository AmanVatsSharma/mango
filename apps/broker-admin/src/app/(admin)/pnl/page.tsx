/**
 * File:        apps/broker-admin/src/app/(admin)/pnl/page.tsx
 * Module:      broker-admin · Finance · P&L Statement
 * Purpose:     Broker P&L breakdown by revenue line with stacked bar chart and period comparison
 *
 * Exports:
 *   - default (PnLPage) — P&L dashboard with recharts stacked bar + tabular breakdown
 *
 * Depends on:
 *   - @/lib/mock-data-context — useBrokerData() for revenueData (RevenuePoint[])
 *   - recharts              — ComposedChart, Bar, Line for P&L visualization
 *
 * Side-effects:
 *   - none (read-only)
 *
 * Key invariants:
 *   - Revenue lines: Spread + Commission + Swap = Gross; Gross - bonusCost = Net
 *   - All chart components must be 'use client' — recharts is browser-only
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { usePnLStats } from '@/lib/api/hooks/use-pnl-stats';
import type { RevenuePoint } from '@/lib/types';

type Period = 'daily' | 'weekly' | 'monthly';

function fmtUSD(n: number) {
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(1)}K`
    : `$${n.toFixed(0)}`;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-r-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-lg">
      <p className="kpi-label mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between gap-4 py-0.5">
          <span className="text-[11px]" style={{ color: p.color }}>{p.name}</span>
          <span className="mono-cell text-[11px] text-fg1">{fmtUSD(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function PnLPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const { data: revenueData, isLoading } = usePnLStats(period);

  // Aggregate data by period
  const chartData = useMemo((): RevenuePoint[] => {
    if (period === 'daily') return revenueData.slice(-14);
    if (period === 'weekly') {
      const weeks: RevenuePoint[] = [];
      for (let i = 0; i < revenueData.length; i += 7) {
        const chunk = revenueData.slice(i, i + 7);
        weeks.push({
          label: chunk[0].label,
          spread:     chunk.reduce((s, r) => s + r.spread, 0),
          commission: chunk.reduce((s, r) => s + r.commission, 0),
          swap:       chunk.reduce((s, r) => s + r.swap, 0),
          bonusCost:  chunk.reduce((s, r) => s + r.bonusCost, 0),
          total:      chunk.reduce((s, r) => s + r.total, 0),
        });
      }
      return weeks;
    }
    // monthly — return all (assumed monthly labels in mock data)
    return revenueData;
  }, [revenueData, period]);

  const totals = useMemo(() => ({
    spread:     chartData.reduce((s, r) => s + r.spread, 0),
    commission: chartData.reduce((s, r) => s + r.commission, 0),
    swap:       chartData.reduce((s, r) => s + r.swap, 0),
    bonusCost:  chartData.reduce((s, r) => s + r.bonusCost, 0),
    gross:      chartData.reduce((s, r) => s + r.spread + r.commission + r.swap, 0),
    net:        chartData.reduce((s, r) => s + r.total, 0),
  }), [chartData]);

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">P&amp;L Statement</p>
          <p className="module-subtitle">Net revenue breakdown by source</p>
        </div>
        <div className="chart-tabs">
          {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
            <button key={p} className={`chart-tab ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <span className="font-ui text-[12px] text-fg3">Loading P&L data…</span>
          </div>
        ) : revenueData.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
            <p className="font-ui text-[12px] text-fg2">No revenue data available</p>
            <p className="font-ui text-[11px] text-fg3">Try selecting a different period</p>
          </div>
        ) : (
          <>
        {/* Revenue KPI strip */}
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: 'Spread Revenue',  value: totals.spread,     color: 'text-bull'   },
            { label: 'Commission',      value: totals.commission,  color: 'text-accent' },
            { label: 'Swap Revenue',    value: totals.swap,        color: 'text-purple' },
            { label: 'Gross Revenue',   value: totals.gross,       color: 'text-fg1'    },
            { label: 'Bonus Cost',      value: -totals.bonusCost,  color: 'text-bear'   },
            { label: 'Net Revenue',     value: totals.net,         color: 'text-bull'   },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <p className="kpi-label">{k.label}</p>
              <p className={`kpi-value ${k.color}`}>{fmtUSD(Math.abs(k.value))}</p>
              {k.label === 'Bonus Cost' && <p className="kpi-sub text-bear">- cost</p>}
            </div>
          ))}
        </div>

        {/* Stacked bar chart */}
        <div className="card p-4">
          <p className="card-title mb-4">Revenue Breakdown</p>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--fg3)', fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtUSD(v as number)} tick={{ fontSize: 10, fill: 'var(--fg3)', fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} width={56} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'DM Sans' }} />
              <Bar dataKey="spread"     name="Spread"     stackId="a" fill="rgba(16,217,150,0.7)" radius={[0,0,0,0]} />
              <Bar dataKey="commission" name="Commission" stackId="a" fill="rgba(59,130,246,0.7)" radius={[0,0,0,0]} />
              <Bar dataKey="swap"       name="Swap"       stackId="a" fill="rgba(168,85,247,0.7)" radius={[4,4,0,0]} />
              <Line dataKey="total" name="Net" stroke="var(--bull)" strokeWidth={2} dot={false} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Tabular breakdown */}
        <div className="card overflow-x-auto">
          <div className="card-header">
            <p className="card-title">Period Detail</p>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Spread</th>
                <th>Commission</th>
                <th>Swap</th>
                <th>Gross</th>
                <th>Bonus Cost</th>
                <th>Net Revenue</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map(row => {
                const gross = row.spread + row.commission + row.swap;
                return (
                  <tr key={row.label}>
                    <td className="mono-cell text-[11px]">{row.label}</td>
                    <td className="delta-positive mono-cell">{fmtUSD(row.spread)}</td>
                    <td className="delta-positive mono-cell">{fmtUSD(row.commission)}</td>
                    <td className="delta-positive mono-cell">{fmtUSD(row.swap)}</td>
                    <td className="mono-cell font-bold text-[12px] text-fg1">{fmtUSD(gross)}</td>
                    <td className="delta-negative mono-cell">-{fmtUSD(row.bonusCost)}</td>
                    <td className="mono-cell font-bold text-[12px] text-bull">{fmtUSD(row.total)}</td>
                  </tr>
                );
              })}
              <tr className="bg-[var(--bg-elevated)]">
                <td className="font-semibold text-[11px] text-fg1">TOTAL</td>
                <td className="delta-positive mono-cell font-bold">{fmtUSD(totals.spread)}</td>
                <td className="delta-positive mono-cell font-bold">{fmtUSD(totals.commission)}</td>
                <td className="delta-positive mono-cell font-bold">{fmtUSD(totals.swap)}</td>
                <td className="mono-cell font-bold text-[13px] text-fg1">{fmtUSD(totals.gross)}</td>
                <td className="delta-negative mono-cell font-bold">-{fmtUSD(totals.bonusCost)}</td>
                <td className="mono-cell font-bold text-[13px] text-bull">{fmtUSD(totals.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
          </>
        )}  {/* end of revenueData.length === 0 guard */}
      </div>
    </div>
  );
}
