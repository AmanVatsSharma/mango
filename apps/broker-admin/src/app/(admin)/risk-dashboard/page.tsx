/**
 * File:        apps/broker-admin/src/app/(admin)/risk-dashboard/page.tsx
 * Module:      broker-admin · Risk Dashboard
 * Purpose:     Consolidated risk view — symbol exposure treemap, margin utilization,
 *              surveillance alerts table with slide-in detail, and AML score distribution
 *
 * Exports:
 *   - RiskDashboardPage — default page export
 *
 * Depends on:
 *   - @/lib/mock-data-context — useBrokerData() for alerts, resolveAlert, clients
 *   - @/lib/mock-data — MOCK_RISK_METRICS, MOCK_EXPOSURE_LIMITS
 *   - recharts — Treemap, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, Tooltip
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - 'use client' — alert detail open state, resolve action
 *   - Treemap sized explicitly to 320px to avoid zero-height ResponsiveContainer bug
 *   - Treemap content renders text only when width >= 60px (avoids overflow)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState, useMemo } from 'react';
import {
  Treemap, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, Tooltip,
} from 'recharts';
import {
  ShieldAlert, AlertTriangle, CheckCircle2, Eye, ChevronRight, X,
  TrendingUp, TrendingDown, Activity, Users,
} from 'lucide-react';
import { useBrokerData } from '@/lib/mock-data-context';
import { MOCK_RISK_METRICS, MOCK_EXPOSURE_LIMITS } from '@/lib/mock-data';
import type { SurveillanceAlert } from '@/lib/types';

// ─── HELPERS ───────────────────────────────────────────────────────────────────

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtM = (n: number) => `$${(n / 1_000_000).toFixed(2)}M`;

const severityColor = (s: string) => {
  switch (s) {
    case 'Critical': return 'text-bear';
    case 'High':     return 'text-warn';
    case 'Medium':   return 'text-gold';
    default:         return 'text-fg3';
  }
};

const severityDot = (s: string) => {
  switch (s) {
    case 'Critical': return 'bg-bear';
    case 'High':     return 'bg-warn';
    case 'Medium':   return 'bg-gold';
    default:         return 'bg-fg3';
  }
};

const statusBadge = (s: string) => {
  switch (s) {
    case 'Open':         return 'badge-bear';
    case 'Under Review': return 'badge-warn';
    case 'Resolved':     return 'badge-bull';
    case 'Escalated':    return 'badge-purple';
    default:             return 'badge-muted';
  }
};

// ─── TREEMAP CELL ──────────────────────────────────────────────────────────────

interface TreemapCellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  netExposure?: number;
  bookType?: string;
  depth?: number;
}

function TreemapCell({ x = 0, y = 0, width = 0, height = 0, name, netExposure, bookType }: TreemapCellProps) {
  if (width < 2 || height < 2) return null;

  const bgColor =
    bookType === 'A-Book' ? 'rgba(59,130,246,0.15)' :
    bookType === 'B-Book' ? 'rgba(255,59,92,0.15)' :
    'rgba(168,85,247,0.15)';

  const borderColor =
    bookType === 'A-Book' ? 'rgba(59,130,246,0.5)' :
    bookType === 'B-Book' ? 'rgba(255,59,92,0.5)' :
    'rgba(168,85,247,0.5)';

  const textColor =
    bookType === 'A-Book' ? '#3B82F6' :
    bookType === 'B-Book' ? '#FF3B5C' :
    '#A855F7';

  const showText = width >= 55 && height >= 36;
  const showSub  = width >= 70 && height >= 52;

  return (
    <g>
      <rect
        x={x + 1}
        y={y + 1}
        width={width - 2}
        height={height - 2}
        rx={3}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={1}
      />
      {showText && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showSub ? 8 : 0)}
          textAnchor="middle"
          fill={textColor}
          fontSize={Math.min(13, width / 5)}
          fontFamily="var(--font-data)"
          fontWeight="700"
        >
          {name}
        </text>
      )}
      {showSub && netExposure != null && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 12}
          textAnchor="middle"
          fill="var(--fg3)"
          fontSize={Math.min(10, width / 7)}
          fontFamily="var(--font-data)"
        >
          ${(netExposure / 1_000_000).toFixed(1)}M
        </text>
      )}
    </g>
  );
}

// ─── ALERT DETAIL DRAWER ───────────────────────────────────────────────────────

function AlertDrawer({ alert, onClose, onResolve }: {
  alert: SurveillanceAlert;
  onClose: () => void;
  onResolve: (id: string) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-[460px] flex-col border-l border-[var(--border-md)] bg-[var(--bg-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${severityDot(alert.severity)}`} />
              <h2 className="font-display text-[14px] font-semibold tracking-wide text-fg1 uppercase">{alert.pattern}</h2>
              <span className={`badge ${statusBadge(alert.status)}`}>{alert.status}</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-fg3">{alert.id} · detected {alert.detectedAt}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs"><X size={13} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Client Info */}
          <div className="card p-4">
            <p className="font-display text-[10px] font-semibold tracking-widest text-fg3 uppercase">Client</p>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <p className="font-ui text-[13px] font-medium text-fg1">{alert.clientName}</p>
                <p className="font-mono text-[11px] text-fg3">{alert.clientId}</p>
              </div>
              <span className={`font-semibold ${severityColor(alert.severity)} font-display text-[11px] tracking-wide uppercase`}>
                {alert.severity} RISK
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="card p-4">
            <p className="font-display text-[10px] font-semibold tracking-widest text-fg3 uppercase">Pattern Description</p>
            <p className="mt-2 font-ui text-[12px] leading-relaxed text-fg2">{alert.description}</p>
          </div>

          {/* Related Trades */}
          {alert.trades.length > 0 && (
            <div className="card p-4">
              <p className="font-display text-[10px] font-semibold tracking-widest text-fg3 uppercase">Linked Orders</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {alert.trades.map(t => (
                  <span key={t} className="badge badge-accent">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Assigned To */}
          {alert.assignedTo && (
            <div className="card p-4">
              <p className="font-display text-[10px] font-semibold tracking-widest text-fg3 uppercase">Assigned Analyst</p>
              <p className="mt-1 font-ui text-[12px] text-fg1">{alert.assignedTo}</p>
            </div>
          )}

          {/* Resolution */}
          {alert.resolution && (
            <div className="card border-bull/20 p-4">
              <p className="font-display text-[10px] font-semibold tracking-widest text-bull uppercase">Resolution</p>
              <p className="mt-1 font-ui text-[12px] text-fg2">{alert.resolution}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {alert.status !== 'Resolved' && (
          <div className="border-t border-[var(--border)] px-5 py-3 space-y-2">
            {confirmed ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 font-ui text-[11px] text-warn">Mark this alert as resolved?</span>
                <button className="btn btn-bull btn-xs" onClick={() => { onResolve(alert.id); onClose(); }}>Confirm</button>
                <button className="btn btn-ghost btn-xs" onClick={() => setConfirmed(false)}>Cancel</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button className="btn btn-bull btn-sm flex-1 gap-1.5" onClick={() => setConfirmed(true)}>
                  <CheckCircle2 size={12} /> Resolve Alert
                </button>
                <button className="btn btn-danger btn-sm flex-1 gap-1.5">
                  <ShieldAlert size={12} /> Escalate
                </button>
              </div>
            )}
            <button className="btn btn-ghost btn-sm w-full gap-1.5">
              <Eye size={12} /> View Client Profile
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── AML DISTRIBUTION ─────────────────────────────────────────────────────────

function useAmlDistribution(clients: ReturnType<typeof useBrokerData>['clients']) {
  return useMemo(() => {
    const buckets = [
      { range: '0–10', min: 0, max: 10, count: 0, label: 'Clear' },
      { range: '11–25', min: 11, max: 25, count: 0, label: 'Low' },
      { range: '26–50', min: 26, max: 50, count: 0, label: 'Elevated' },
      { range: '51–75', min: 51, max: 75, count: 0, label: 'High' },
      { range: '76–100', min: 76, max: 100, count: 0, label: 'Critical' },
    ];
    clients.forEach(c => {
      const b = buckets.find(b => c.amlScore >= b.min && c.amlScore <= b.max);
      if (b) b.count++;
    });
    return buckets;
  }, [clients]);
}

// ─── PAGE ──────────────────────────────────────────────────────────────────────

export default function RiskDashboardPage() {
  const { surveillance: alerts, resolveAlert, clients } = useBrokerData();
  const [selectedAlert, setSelectedAlert] = useState<SurveillanceAlert | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('All');

  const treemapData = MOCK_RISK_METRICS.map(r => ({
    name: r.symbol,
    size: r.netExposure,
    netExposure: r.netExposure,
    bookType: r.bookType,
  }));

  const filteredAlerts = useMemo(() => {
    let list = [...alerts].sort((a, b) => {
      const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (order[a.severity as keyof typeof order] ?? 4) - (order[b.severity as keyof typeof order] ?? 4);
    });
    if (filterSeverity !== 'All') list = list.filter(a => a.severity === filterSeverity);
    return list;
  }, [alerts, filterSeverity]);

  const amlData = useAmlDistribution(clients);

  const totalExposure = MOCK_RISK_METRICS.reduce((s, r) => s + r.netExposure, 0);
  const breachCount   = MOCK_EXPOSURE_LIMITS.filter(e => e.status === 'Breach').length;
  const warnCount     = MOCK_EXPOSURE_LIMITS.filter(e => e.status === 'Warning').length;
  const openAlerts    = alerts.filter(a => a.status === 'Open').length;

  return (
    <>
      <div className="space-y-0">
        {/* Header */}
        <div className="module-header">
          <div>
            <h1 className="module-title flex items-center gap-2">
              <ShieldAlert size={14} className="text-bear" />
              Risk Dashboard
            </h1>
            <p className="module-subtitle">
              Real-time exposure monitoring, surveillance alerts, and AML analytics
            </p>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-4 border-b border-[var(--border)]">
          {[
            { label: 'TOTAL NET EXPOSURE', value: fmtM(totalExposure), color: 'text-fg1', sub: 'across all symbols' },
            { label: 'LIMIT BREACHES', value: breachCount.toString(), color: breachCount > 0 ? 'text-bear' : 'text-fg3', sub: 'hard limits breached' },
            { label: 'WARNINGS ACTIVE', value: warnCount.toString(), color: warnCount > 0 ? 'text-warn' : 'text-fg3', sub: 'above alert threshold' },
            { label: 'OPEN ALERTS', value: openAlerts.toString(), color: openAlerts > 0 ? 'text-bear' : 'text-bull', sub: 'surveillance flags' },
          ].map(k => (
            <div key={k.label} className="border-r border-[var(--border)] px-6 py-4 last:border-r-0">
              <p className="kpi-label">{k.label}</p>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
              <p className="kpi-sub">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Row 1: Treemap + Utilization */}
        <div className="grid grid-cols-2 divide-x divide-[var(--border)] border-b border-[var(--border)]">
          {/* Treemap */}
          <div>
            <div className="card-header">
              <span className="card-title">SYMBOL EXPOSURE HEATMAP</span>
              <div className="flex items-center gap-3">
                {[
                  { label: 'A-Book', color: 'bg-accent/60' },
                  { label: 'B-Book', color: 'bg-bear/60' },
                  { label: 'Hybrid', color: 'bg-purple/60' },
                ].map(l => (
                  <span key={l.label} className="flex items-center gap-1 font-ui text-[10px] text-fg3">
                    <span className={`h-2 w-2 rounded-sm ${l.color}`} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="p-4" style={{ height: 300 }}>
              <Treemap
                width={560}
                height={268}
                data={treemapData}
                dataKey="size"
                aspectRatio={4 / 3}
                content={<TreemapCell />}
              />
            </div>
          </div>

          {/* Utilization Bars */}
          <div>
            <div className="card-header">
              <span className="card-title">LIMIT UTILIZATION</span>
              <span className="font-ui text-[11px] text-fg3">current vs max</span>
            </div>
            <div className="space-y-3 px-5 py-4">
              {MOCK_EXPOSURE_LIMITS.map(el => {
                const color = el.status === 'Breach' ? 'bg-bear' : el.status === 'Warning' ? 'bg-warn' : 'bg-bull';
                const textCol = el.status === 'Breach' ? 'text-bear' : el.status === 'Warning' ? 'text-warn' : 'text-bull';
                return (
                  <div key={el.id} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-fg1">{el.symbol}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold ${textCol}`}>{el.utilizationPct.toFixed(1)}%</span>
                        <span className={`badge ${
                          el.status === 'Breach' ? 'badge-bear' :
                          el.status === 'Warning' ? 'badge-warn' : 'badge-bull'
                        }`}>{el.status}</span>
                      </div>
                    </div>
                    <div className="relative h-2 w-full rounded-full bg-[var(--bg-elevated)]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${color}`}
                        style={{ width: `${Math.min(el.utilizationPct, 100)}%` }}
                      />
                      {/* Alert threshold marker */}
                      <div
                        className="absolute top-0 h-full w-px bg-warn/60"
                        style={{ left: `${el.alertThreshold}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-fg3">
                      <span>{fmtM(el.currentNetExposure)}</span>
                      <span>Max {fmtM(el.maxNetExposure)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 2: Surveillance Alerts + AML */}
        <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
          {/* Surveillance Alerts Table */}
          <div className="col-span-2">
            <div className="card-header">
              <span className="card-title flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-warn" />
                SURVEILLANCE ALERTS
              </span>
              <div className="flex items-center gap-2">
                <select
                  className="input input-sm w-28"
                  value={filterSeverity}
                  onChange={e => setFilterSeverity(e.target.value)}
                >
                  {['All', 'Critical', 'High', 'Medium', 'Low'].map(v => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <span className="font-ui text-[11px] text-fg3">{filteredAlerts.length} alerts</span>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>SEV</th>
                  <th>PATTERN</th>
                  <th>CLIENT</th>
                  <th>DETECTED</th>
                  <th>STATUS</th>
                  <th>ASSIGNED</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map(alert => (
                  <tr
                    key={alert.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedAlert(alert)}
                  >
                    <td>
                      <span className={`h-2 w-2 inline-block rounded-full ${severityDot(alert.severity)}`} />
                    </td>
                    <td>
                      <div>
                        <p className={`font-ui text-[12px] font-medium ${severityColor(alert.severity)}`}>{alert.pattern}</p>
                        <p className="mt-0.5 truncate font-ui text-[10px] text-fg3 max-w-[200px]">{alert.description.substring(0, 60)}…</p>
                      </div>
                    </td>
                    <td>
                      <p className="font-ui text-[12px] text-fg1">{alert.clientName}</p>
                      <p className="font-mono text-[10px] text-fg3">{alert.clientId}</p>
                    </td>
                    <td className="font-ui text-[11px] text-fg3">{alert.detectedAt.split(' ')[1]}</td>
                    <td><span className={`badge ${statusBadge(alert.status)}`}>{alert.status}</span></td>
                    <td className="font-ui text-[11px] text-fg2">{alert.assignedTo ?? '—'}</td>
                    <td>
                      <ChevronRight size={13} className="text-fg3" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AML Score Distribution */}
          <div>
            <div className="card-header">
              <span className="card-title">AML SCORE DISTRIBUTION</span>
            </div>
            <div className="px-4 pb-4 pt-2" style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={amlData} barCategoryGap="30%">
                  <XAxis
                    dataKey="range"
                    tick={{ fill: 'var(--fg3)', fontSize: 10, fontFamily: 'var(--font-data)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--fg3)', fontSize: 10, fontFamily: 'var(--font-data)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-md)',
                      borderRadius: 4,
                      fontFamily: 'var(--font-data)',
                      fontSize: 11,
                      color: 'var(--fg1)',
                    }}
                    labelStyle={{ color: 'var(--fg3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                  />
                  <Bar dataKey="count" name="Clients" radius={[2, 2, 0, 0]}>
                    {amlData.map((d, i) => {
                      const colors = ['var(--bull)', 'var(--fg3)', 'var(--warn)', 'var(--bear)', 'var(--bear)'];
                      return <Cell key={i} fill={colors[i]} fillOpacity={0.8} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="border-t border-[var(--border)] px-4 pb-4 pt-3 space-y-1.5">
              {amlData.map(b => (
                <div key={b.range} className="flex items-center justify-between">
                  <span className="font-ui text-[11px] text-fg3">{b.range} — {b.label}</span>
                  <span className="font-mono text-[12px] font-semibold text-fg1">{b.count}</span>
                </div>
              ))}
            </div>

            {/* Top exposure positions */}
            <div className="border-t border-[var(--border)] px-4 py-3">
              <p className="card-title mb-2">TOP EXPOSURES</p>
              <div className="space-y-2">
                {MOCK_RISK_METRICS.slice(0, 4).map(r => (
                  <div key={r.symbol} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-fg1">{r.symbol}</span>
                      <span className="badge badge-muted text-[9px]">{r.bookType}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[11px] text-fg1">{fmtM(r.netExposure)}</p>
                      <p className="font-ui text-[10px] text-fg3">{r.clientCount} clients</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Drawer */}
      {selectedAlert && (
        <AlertDrawer
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onResolve={(id) => { resolveAlert(id, 'Resolved by compliance analyst'); setSelectedAlert(null); }}
        />
      )}
    </>
  );
}
