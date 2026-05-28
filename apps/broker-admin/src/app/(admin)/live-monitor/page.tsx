/**
 * File:        apps/broker-admin/src/app/(admin)/live-monitor/page.tsx
 * Module:      broker-admin · Live Monitor
 * Purpose:     Real-time open-position blotter with live P&L tick simulation, symbol exposure chart,
 *              risk utilization bars, and dealer intervention queue
 *
 * Exports:
 *   - LiveMonitorPage — default page export
 *
 * Depends on:
 *   - @/lib/mock-data-context — useBrokerData() for resolveAlert
 *   - @/lib/mock-data — MOCK_ORDERS, MOCK_RISK_METRICS, MOCK_EXPOSURE_LIMITS
 *   - recharts — BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip
 *
 * Side-effects:
 *   - setInterval(2000) — live P&L tick simulation, cleared on unmount
 *
 * Key invariants:
 *   - 'use client' — uses setInterval and useState
 *   - Only Open-status orders are ticked; Pending/Filled rows remain static
 *   - tickDir resets to 'flat' after 600ms (brief flash indicator)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, ReferenceLine,
} from 'recharts';
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, Clock, ChevronRight,
  Zap, TrendingUp, TrendingDown, Eye, Ban, RefreshCw,
} from 'lucide-react';
import { MOCK_ORDERS, MOCK_RISK_METRICS, MOCK_EXPOSURE_LIMITS } from '@/lib/mock-data';
import type { Order } from '@/lib/types';

// ─── TYPES ─────────────────────────────────────────────────────────────────────

type TickDir = 'up' | 'down' | 'flat';

interface LivePosition extends Order {
  tickDir: TickDir;
}

interface DealerItem {
  orderId: string;
  clientName: string;
  symbol: string;
  reason: string;
  severity: 'critical' | 'warning';
  since: string;
}

// ─── MOCK DEALER QUEUE ─────────────────────────────────────────────────────────

const DEALER_QUEUE: DealerItem[] = [
  { orderId: 'ORD001', clientName: 'Tariq Hassan',     symbol: 'EUR/USD', reason: 'Margin level 31.7% — approaching stop-out',    severity: 'critical', since: '3 min ago' },
  { orderId: 'ORD004', clientName: 'Priya Sharma',     symbol: 'USD/JPY', reason: 'Adverse slippage >8 pips vs LP fill',           severity: 'warning',  since: '7 min ago' },
  { orderId: 'ORD005', clientName: 'Omar Abdullah',    symbol: 'US30',    reason: 'Order size 2× client avg — anomaly check',      severity: 'warning',  since: '12 min ago' },
];

// ─── HELPERS ───────────────────────────────────────────────────────────────────

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);

const fmtPnl = (n: number) => {
  const abs = fmtUSD(Math.abs(n));
  return n >= 0 ? `+${abs}` : `-${abs.slice(1)}`;
};

const fmtPrice = (n: number, digits = 5) => n.toFixed(digits);

const pnlClass = (n: number) =>
  n > 0 ? 'delta-positive' : n < 0 ? 'delta-negative' : 'delta-neutral';

const sideClass = (side: 'Buy' | 'Sell') =>
  side === 'Buy' ? 'text-bull font-semibold' : 'text-bear font-semibold';

// Tick a price by ±1-3 pips
function tickPrice(price: number) {
  const pip = price > 10 ? 0.01 : price > 1 ? 0.00010 : 0.0001;
  return parseFloat((price + (Math.random() - 0.48) * pip * 3).toFixed(price > 100 ? 1 : price > 10 ? 3 : 5));
}

// ─── EXPOSURE CHART DATA ────────────────────────────────────────────────────────

const exposureData = MOCK_RISK_METRICS.map(r => ({
  symbol: r.symbol,
  long: +(r.longExposure / 1_000).toFixed(0),
  short: -Math.round(r.shortExposure / 1_000),
  net: +(r.netExposure / 1_000).toFixed(0),
  bookType: r.bookType,
}));

// ─── CUSTOM TOOLTIP ────────────────────────────────────────────────────────────

function ExposureTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-[var(--border-md)] bg-[var(--bg-elevated)] px-3 py-2">
      <p className="font-display text-[10px] font-semibold tracking-widest text-fg3 uppercase">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="font-mono text-[11px] text-fg1">
          {p.name}: {p.value > 0 ? '+' : ''}{p.value}K
        </p>
      ))}
    </div>
  );
}

// ─── UTILIZATION BAR ───────────────────────────────────────────────────────────

function UtilizationBar({ symbol, pct, status, max }: {
  symbol: string;
  pct: number;
  status: 'Normal' | 'Warning' | 'Breach';
  max: number;
}) {
  const color = status === 'Breach' ? 'bg-bear' : status === 'Warning' ? 'bg-warn' : 'bg-bull';
  const textColor = status === 'Breach' ? 'text-bear' : status === 'Warning' ? 'text-warn' : 'text-bull';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-fg1">{symbol}</span>
        <span className={`font-mono text-[11px] font-semibold ${textColor}`}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[var(--bg-elevated)]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex justify-between">
        <span className="font-ui text-[10px] text-fg3">{status}</span>
        <span className="font-ui text-[10px] text-fg3">Max ${(max / 1_000_000).toFixed(1)}M</span>
      </div>
    </div>
  );
}

// ─── PAGE ──────────────────────────────────────────────────────────────────────

export default function LiveMonitorPage() {
  const [positions, setPositions] = useState<LivePosition[]>(() =>
    MOCK_ORDERS.filter(o => o.status === 'Open').map(o => ({ ...o, tickDir: 'flat' as TickDir }))
  );
  const [lastTick, setLastTick] = useState<string>('');
  const [selectedDealer, setSelectedDealer] = useState<DealerItem | null>(null);
  const [resolvedQueue, setResolvedQueue] = useState<Set<string>>(new Set());

  // Live tick simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setPositions(prev =>
        prev.map(pos => {
          if (pos.status !== 'Open' || !pos.currentPrice || !pos.floatPnl) return pos;
          const newPrice = tickPrice(pos.currentPrice);
          const prevPnl = pos.floatPnl;
          const pnlDelta = (Math.random() - 0.48) * 80;
          const newPnl = parseFloat((prevPnl + pnlDelta).toFixed(2));
          const dir: TickDir = newPnl > prevPnl ? 'up' : newPnl < prevPnl ? 'down' : 'flat';
          return { ...pos, currentPrice: newPrice, floatPnl: newPnl, tickDir: dir };
        })
      );
      setLastTick(new Date().toUTCString().split(' ')[4] + ' UTC');
    }, 2000);

    // Reset tick direction flash after 600ms
    const flashReset = setInterval(() => {
      setPositions(prev => prev.map(p => ({ ...p, tickDir: 'flat' as TickDir })));
    }, 600);

    return () => { clearInterval(interval); clearInterval(flashReset); };
  }, []);

  const openCount = positions.length;
  const totalFloat = positions.reduce((s, p) => s + (p.floatPnl ?? 0), 0);
  const atRiskCount = positions.filter(p => (p.floatPnl ?? 0) < -200).length;

  const handleDismiss = useCallback((orderId: string) => {
    setResolvedQueue(prev => new Set([...prev, orderId]));
    setSelectedDealer(null);
  }, []);

  const pendingQueue = DEALER_QUEUE.filter(d => !resolvedQueue.has(d.orderId));

  return (
    <div className="space-y-0">
      {/* Module Header */}
      <div className="module-header">
        <div>
          <h1 className="module-title flex items-center gap-2">
            <Activity size={14} className="text-bull" />
            Live Monitor
          </h1>
          <p className="module-subtitle">
            Real-time open positions · {openCount} positions · last tick{' '}
            <span className="font-mono text-[11px] text-fg2">{lastTick || '—'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 font-ui text-[11px] text-fg3">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bull" />
            LIVE
          </span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 border-b border-[var(--border)]">
        {[
          { label: 'OPEN POSITIONS', value: openCount.toString(), sub: 'across all clients', color: 'text-accent' },
          {
            label: 'TOTAL FLOAT P&L',
            value: fmtPnl(totalFloat),
            sub: 'unrealized across all accounts',
            color: totalFloat >= 0 ? 'text-bull' : 'text-bear',
          },
          { label: 'POSITIONS AT RISK', value: atRiskCount.toString(), sub: 'float P&L < −$200', color: atRiskCount > 0 ? 'text-warn' : 'text-fg3' },
          { label: 'DEALER QUEUE', value: pendingQueue.length.toString(), sub: 'pending manual review', color: pendingQueue.length > 0 ? 'text-bear' : 'text-fg3' },
        ].map(k => (
          <div key={k.label} className="border-r border-[var(--border)] px-6 py-4 last:border-r-0">
            <p className="kpi-label">{k.label}</p>
            <p className={`kpi-value ${k.color}`}>{k.value}</p>
            <p className="kpi-sub">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
        {/* ── Open Positions Blotter ───────────────────────────── */}
        <div className="col-span-2">
          <div className="card-header">
            <span className="card-title">OPEN POSITIONS</span>
            <span className="font-ui text-[11px] text-fg3">{openCount} active</span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ORDER</th>
                  <th>CLIENT</th>
                  <th>SYMBOL</th>
                  <th>SIDE</th>
                  <th>LOTS</th>
                  <th>OPEN</th>
                  <th>CURRENT</th>
                  <th>FLOAT P&L</th>
                  <th>SWAP</th>
                  <th>SINCE</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(pos => (
                  <tr key={pos.id} className="group">
                    <td className="mono-cell text-fg3">{pos.id}</td>
                    <td>
                      <span className="font-ui text-[12px] text-fg1">{pos.clientName}</span>
                    </td>
                    <td className="mono-cell font-semibold text-fg1">{pos.symbol}</td>
                    <td>
                      <span className={sideClass(pos.side)}>{pos.side.toUpperCase()}</span>
                    </td>
                    <td className="mono-cell">{pos.lots.toFixed(2)}</td>
                    <td className="mono-cell text-fg2">{fmtPrice(pos.openPrice)}</td>
                    <td
                      className={`mono-cell transition-colors duration-150 ${
                        pos.tickDir === 'up'
                          ? 'text-bull'
                          : pos.tickDir === 'down'
                          ? 'text-bear'
                          : 'text-fg1'
                      }`}
                    >
                      {pos.currentPrice ? fmtPrice(pos.currentPrice) : '—'}
                    </td>
                    <td>
                      <span
                        className={`font-mono text-[12px] font-semibold transition-all duration-150 ${
                          pos.tickDir === 'up'
                            ? 'text-bull'
                            : pos.tickDir === 'down'
                            ? 'text-bear'
                            : pnlClass(pos.floatPnl ?? 0)
                        }`}
                        style={{ fontFeatureSettings: '"tnum" 1' }}
                      >
                        {pos.floatPnl != null ? fmtPnl(pos.floatPnl) : '—'}
                      </span>
                    </td>
                    <td className="mono-cell text-fg3">{pos.swap.toFixed(2)}</td>
                    <td className="font-ui text-[11px] text-fg3">
                      {pos.openTime.split(' ')[1]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Dealer Queue ─────────────────────────────────────── */}
        <div className="flex flex-col">
          <div className="card-header">
            <span className="card-title flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-warn" />
              DEALER QUEUE
            </span>
            <span
              className={`badge ${pendingQueue.length > 0 ? 'badge-warn' : 'badge-muted'}`}
            >
              {pendingQueue.length}
            </span>
          </div>

          {pendingQueue.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
              <Zap size={24} className="text-bull" />
              <p className="font-ui text-[12px] text-fg2">Queue clear</p>
              <p className="font-ui text-[11px] text-fg3">No pending interventions</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {pendingQueue.map(item => (
                <button
                  key={item.orderId}
                  onClick={() => setSelectedDealer(selectedDealer?.orderId === item.orderId ? null : item)}
                  className="w-full cursor-pointer px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            item.severity === 'critical' ? 'bg-bear' : 'bg-warn'
                          }`}
                        />
                        <span className="font-mono text-[11px] font-semibold text-fg1">{item.symbol}</span>
                        <span className="font-mono text-[10px] text-fg3">{item.orderId}</span>
                      </div>
                      <p className="mt-0.5 font-ui text-[11px] font-medium text-fg1">{item.clientName}</p>
                      <p className="mt-0.5 truncate font-ui text-[11px] text-fg3">{item.reason}</p>
                      <p className="mt-1 font-ui text-[10px] text-fg3">{item.since}</p>
                    </div>
                    <ChevronRight
                      size={12}
                      className={`mt-1 shrink-0 transition-transform ${
                        selectedDealer?.orderId === item.orderId ? 'rotate-90' : ''
                      } text-fg3`}
                    />
                  </div>

                  {/* Expanded Actions */}
                  {selectedDealer?.orderId === item.orderId && (
                    <div
                      className="mt-3 flex flex-col gap-1.5 border-t border-[var(--border)] pt-3"
                      onClick={e => e.stopPropagation()}
                    >
                      <button className="btn btn-ghost btn-sm w-full justify-start gap-2">
                        <Eye size={12} /> View Position Detail
                      </button>
                      <button className="btn btn-danger btn-sm w-full justify-start gap-2">
                        <Ban size={12} /> Force Close
                      </button>
                      <button
                        className="btn btn-ghost btn-sm w-full justify-start gap-2 text-fg3"
                        onClick={() => handleDismiss(item.orderId)}
                      >
                        <RefreshCw size={12} /> Dismiss
                      </button>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Exposure Chart + Utilization ─────────── */}
      <div className="grid grid-cols-2 divide-x divide-[var(--border)] border-t border-[var(--border)]">
        {/* Symbol Exposure Chart */}
        <div>
          <div className="card-header">
            <span className="card-title">SYMBOL NET EXPOSURE ($K)</span>
            <span className="font-ui text-[11px] text-fg3">Long / Short split</span>
          </div>
          <div className="px-4 pb-4 pt-2" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={exposureData} layout="vertical" barCategoryGap="30%">
                <XAxis
                  type="number"
                  tick={{ fill: 'var(--fg3)', fontSize: 10, fontFamily: 'var(--font-data)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `${v > 0 ? '+' : ''}${v}K`}
                />
                <YAxis
                  type="category"
                  dataKey="symbol"
                  width={60}
                  tick={{ fill: 'var(--fg2)', fontSize: 11, fontFamily: 'var(--font-data)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ExposureTooltip />} />
                <ReferenceLine x={0} stroke="var(--border-hi)" strokeWidth={1} />
                <Bar dataKey="long" name="Long" radius={[0, 2, 2, 0]}>
                  {exposureData.map((_, i) => (
                    <Cell key={i} fill="var(--bull)" fillOpacity={0.7} />
                  ))}
                </Bar>
                <Bar dataKey="short" name="Short" radius={[2, 0, 0, 2]}>
                  {exposureData.map((_, i) => (
                    <Cell key={i} fill="var(--bear)" fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Utilization Gauges */}
        <div>
          <div className="card-header">
            <span className="card-title">EXPOSURE UTILIZATION</span>
            <span className="font-ui text-[11px] text-fg3">vs hard limits</span>
          </div>
          <div className="grid grid-cols-2 gap-4 px-4 py-4">
            {MOCK_EXPOSURE_LIMITS.map(el => (
              <UtilizationBar
                key={el.symbol}
                symbol={el.symbol}
                pct={el.utilizationPct}
                status={el.status}
                max={el.maxNetExposure}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
