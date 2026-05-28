/**
 * File:        apps/broker-admin/src/app/(admin)/dashboard/page.tsx
 * Module:      broker-admin · Dashboard
 * Purpose:     Executive overview — KPIs, revenue chart, live activity feed, top clients, system status.
 *              Now wired to real backend APIs (GET /admin/dashboard/stats, GET /admin/users) with
 *              graceful fallback to mock data when APIs are unavailable.
 *
 * Exports:
 *   - DashboardPage() — page component
 *
 * Depends on:
 *   - recharts              — ComposedChart, BarChart, ResponsiveContainer
 *   - ../../../lib/api/hooks/use-broker-dashboard — useRealBrokerData (API-first, mock fallback)
 *
 * Side-effects:
 *   - setInterval 4s for activity feed simulation
 *
 * Key invariants:
 *   - 'use client' — recharts is client-only
 *   - Falls back to mock data if API calls fail (safe default, always renders)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-11
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, AlertTriangle, DollarSign, TrendingUp, UserCheck, Users } from 'lucide-react';
import { cn } from '@obsidian/obsidian-ui';
import { useRealBrokerData } from '../../../lib/api/hooks/use-broker-dashboard';
import type { ActivityEvent } from '../../../lib/types';

// ─── FORMATTERS ────────────────────────────────────────────────────────────────

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtK = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n}`);

const fmtDelta = (n: number, pct: number) =>
  `${n >= 0 ? '+' : ''}${fmtK(n)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;

// ─── SPARKLINE ────────────────────────────────────────────────────────────────

function Sparkline({ data, color = 'var(--accent)' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const W = 80, H = 28;
  const pts = data.map((v, i) =>
    `${((i / (data.length - 1)) * W).toFixed(1)},${(H - ((v - min) / range) * (H - 4) - 2).toFixed(1)}`
  ).join(' ');
  return (
    <svg width={W} height={H} className="block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string;
  sub: string;
  delta: string;
  up: boolean;
  sparkData: number[];
  icon: React.ReactNode;
}

function KPICard({ label, value, sub, delta, up, sparkData, icon }: KPICardProps) {
  return (
    <div className="kpi-card group">
      <div className="flex items-start justify-between">
        <div className="kpi-label">{label}</div>
        <span className="text-fg3 transition-colors group-hover:text-fg2">{icon}</span>
      </div>
      <div className="kpi-value mt-2">{value}</div>
      <div className="kpi-bottom mt-2">
        <div>
          <div className={cn('kpi-delta', up ? 'text-bull' : 'text-bear')}>
            {up ? '▲' : '▼'} {delta}
          </div>
          <div className="kpi-sub">{sub}</div>
        </div>
        <Sparkline data={sparkData} color={up ? 'var(--bull)' : 'var(--bear)'} />
      </div>
    </div>
  );
}

// ─── REVENUE CHART ────────────────────────────────────────────────────────────

function RevenueChart() {
  const { revenueData } = useRealBrokerData();
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');

  const displayed = useMemo(() => {
    if (tab === 'weekly') {
      const weeks: typeof revenueData = [];
      for (let i = 0; i < revenueData.length; i += 7) {
        const chunk = revenueData.slice(i, i + 7);
        if (!chunk.length) continue;
        weeks.push({
          label: chunk[0].label,
          spread:     chunk.reduce((a, b) => a + b.spread, 0),
          commission: chunk.reduce((a, b) => a + b.commission, 0),
          swap:       chunk.reduce((a, b) => a + b.swap, 0),
          bonusCost:  chunk.reduce((a, b) => a + (b.bonusCost ?? 0), 0),
          total:      chunk.reduce((a, b) => a + b.total, 0),
        });
      }
      return weeks;
    }
    return revenueData;
  }, [revenueData, tab]);

  const totalRevenue = displayed.reduce((a, d) => a + d.total, 0);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">MTD Revenue</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[13px] font-semibold text-fg1" style={{ fontFeatureSettings: '"tnum" 1' }}>
            {fmtUSD(totalRevenue)}
          </span>
          <div className="chart-tabs">
            {(['daily', 'weekly'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={cn('chart-tab', tab === t && 'active')}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={displayed} barSize={tab === 'daily' ? 6 : 20}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--fg3)', fontSize: 10, fontFamily: 'var(--font-data)' }}
              tickLine={false} axisLine={false}
              interval={tab === 'daily' ? 4 : 0}
            />
            <YAxis
              tick={{ fill: 'var(--fg3)', fontSize: 10, fontFamily: 'var(--font-data)' }}
              tickLine={false} axisLine={false}
              tickFormatter={v => `$${(v / 1000).toFixed(0)}K`}
              width={48}
            />
            <Tooltip
              contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: 'var(--fg2)', fontFamily: 'var(--font-data)' }}
              itemStyle={{ fontFamily: 'var(--font-data)' }}
              formatter={(v: number) => [fmtUSD(v), '']}
            />
            <Bar dataKey="spread"     stackId="rev" fill="var(--accent)"   name="Spread"     radius={[0,0,0,0]} />
            <Bar dataKey="commission" stackId="rev" fill="var(--bull)"     name="Commission" radius={[0,0,0,0]} />
            <Bar dataKey="swap"       stackId="rev" fill="var(--purple)"   name="Swap"       radius={[2,2,0,0]} />
            <Line dataKey="total" stroke="var(--warn)" strokeWidth={1.5} dot={false} name="Net Total" />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="mt-2 flex gap-4">
          {[['Spread','var(--accent)'],['Commission','var(--bull)'],['Swap','var(--purple)'],['Net','var(--warn)']].map(([l,c]) => (
            <div key={l} className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm" style={{ background: c }} />
              <span className="font-ui text-[11px] text-fg3">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ACTIVITY FEED ────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  alert:        'var(--bear)',
  withdrawal:   'var(--warn)',
  deposit:      'var(--bull)',
  kyc:          'var(--accent)',
  trade:        'var(--purple)',
  registration: 'var(--bull)',
  login:        'var(--fg3)',
};

function ActivityFeed() {
  const { activityFeed } = useRealBrokerData();
  const [feed, setFeed] = useState<ActivityEvent[]>(activityFeed.slice(0, 8));

  useEffect(() => {
    const id = setInterval(() => {
      const fake: ActivityEvent = {
        id: `live-${Date.now()}`,
        type: (['deposit','trade','login','registration'] as const)[Math.floor(Math.random() * 4)],
        message: [
          'New position opened: EUR/USD 2.0 lots Buy',
          'Login: Fatima Al-Rashidi — Dubai, AE',
          'Deposit confirmed: $1,200 VISA',
          'New registration from United Kingdom',
        ][Math.floor(Math.random() * 4)],
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      };
      setFeed(f => [fake, ...f.slice(0, 9)]);
    }, 4_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card flex flex-col">
      <div className="card-header">
        <span className="card-title">Live Activity</span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-bull">
          <span className="h-1.5 w-1.5 rounded-full bg-bull animate-pulse" />
          LIVE
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {feed.map((e, i) => (
          <div
            key={e.id}
            className={cn(
              'flex items-start gap-3 border-b border-[var(--border)] px-4 py-2.5',
              i === 0 && 'bg-[var(--bg-hover)]',
            )}
          >
            <span
              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: EVENT_COLORS[e.type] ?? 'var(--fg3)' }}
            />
            <div className="min-w-0 flex-1">
              <div className="font-ui text-[12px] text-fg2 line-clamp-1">{e.message}</div>
            </div>
            <span className="shrink-0 font-mono text-[10px] text-fg3" style={{ fontFeatureSettings: '"tnum" 1' }}>
              {e.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TOP CLIENTS ──────────────────────────────────────────────────────────────

function TopClients() {
  const { clients } = useRealBrokerData();
  const top = [...clients].sort((a, b) => b.volumeMTD - a.volumeMTD).slice(0, 5);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Top Clients by Volume</span>
        <span className="font-mono text-[10px] text-fg3">MTD LOTS</span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>CLIENT</th>
            <th>TYPE</th>
            <th className="text-right">BALANCE</th>
            <th className="text-right">VOL MTD</th>
            <th className="text-right">FLOAT P&L</th>
          </tr>
        </thead>
        <tbody>
          {top.map(c => (
            <tr key={c.id}>
              <td>
                <div className="flex items-center gap-2">
                  <span>{c.flag}</span>
                  <span className="font-ui text-[12px] text-fg1">{c.name}</span>
                </div>
              </td>
              <td>
                <span className={cn('badge', c.type === 'VIP' ? 'type-vip' : c.type === 'Pro' ? 'type-pro' : 'type-retail')}>
                  {c.type}
                </span>
              </td>
              <td className="mono-cell text-right">{fmtUSD(c.balance)}</td>
              <td className="mono-cell text-right text-fg1">{c.volumeMTD.toFixed(1)}</td>
              <td className={cn('mono-cell text-right', c.floatPnl >= 0 ? 'text-bull' : 'text-bear')}>
                {c.floatPnl >= 0 ? '+' : ''}{fmtUSD(c.floatPnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── SYSTEM STATUS GRID ───────────────────────────────────────────────────────

function SystemStatusGrid() {
  const { systemStatus } = useRealBrokerData();
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">System Health</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {systemStatus.map(s => (
          <div key={s.service} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  s.status === 'operational' ? 'bg-bull' :
                  s.status === 'degraded'    ? 'bg-warn animate-pulse' : 'bg-bear animate-pulse',
                )}
              />
              <span className="font-ui text-[12px] text-fg2">{s.service}</span>
            </div>
            <div className="flex items-center gap-4">
              {s.latency && (
                <span className="font-mono text-[11px] text-fg3" style={{ fontFeatureSettings: '"tnum" 1' }}>
                  {s.latency}ms
                </span>
              )}
              <span className={cn(
                'font-mono text-[10px] uppercase tracking-wide',
                s.status === 'operational' ? 'text-bull' :
                s.status === 'degraded'    ? 'text-warn' : 'text-bear',
              )}>
                {s.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EXPOSURE BAR CHART ───────────────────────────────────────────────────────

function ExposureChart() {
  const { riskMetrics } = useRealBrokerData();
  const data = riskMetrics.map(r => ({
    symbol: r.symbol,
    net: Math.abs(r.netExposure) / 1_000,
    gross: r.grossExposure / 1_000,
  }));

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Net Exposure by Symbol</span>
        <span className="font-mono text-[10px] text-fg3">USD THOUSANDS</span>
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} barSize={16} layout="vertical">
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: 'var(--fg3)', fontSize: 10, fontFamily: 'var(--font-data)' }}
              tickLine={false} axisLine={false}
              tickFormatter={v => `$${v}K`}
            />
            <YAxis
              type="category" dataKey="symbol" width={60}
              tick={{ fill: 'var(--fg2)', fontSize: 11, fontFamily: 'var(--font-data)' }}
              tickLine={false} axisLine={false}
            />
            <Tooltip
              contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', borderRadius: 6, fontSize: 11 }}
              formatter={(v: number) => [`$${v.toFixed(0)}K`, '']}
            />
            <Bar dataKey="net" fill="var(--accent)" name="Net" radius={[0,3,3,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { clients, config, riskMetrics, pendingKycCount, pendingTxCount, openAlertCount } = useRealBrokerData();

  const activeClients  = clients.filter(c => c.status === 'Active').length;
  const totalEquity    = clients.reduce((a, c) => a + c.equity, 0);
  const openPositions  = clients.reduce((a, c) => a + c.openPositions, 0);
  const totalFloatPnl  = clients.reduce((a, c) => a + c.floatPnl, 0);

  const kpis = [
    {
      label: 'Total Clients', value: config.totalClients.toLocaleString(), sub: `${activeClients} active`,
      delta: '+12 this week', up: true,
      sparkData: [1180,1195,1198,1202,1210,1218,1225,1232,1240,1247],
      icon: <Users size={14} strokeWidth={2} />,
    },
    {
      label: 'Total AUM', value: fmtUSD(totalEquity), sub: 'Net equity across accounts',
      delta: fmtDelta(48_200, 1.16), up: true,
      sparkData: [3.8,3.9,3.95,4.0,4.05,4.1,4.12,4.15,4.18,4.2].map(v => v * 1_000_000),
      icon: <DollarSign size={14} strokeWidth={2} />,
    },
    {
      label: 'MTD Revenue', value: fmtUSD(142_480), sub: 'Spread + commission + swap',
      delta: '+$8,240 vs last month', up: true,
      sparkData: [98000,104000,112000,118000,122000,128000,132000,136000,139000,142480],
      icon: <TrendingUp size={14} strokeWidth={2} />,
    },
    {
      label: 'Open Positions', value: openPositions.toString(), sub: `Float P&L: ${totalFloatPnl >= 0 ? '+' : ''}${fmtUSD(totalFloatPnl)}`,
      delta: `${riskMetrics.reduce((a,r) => a + r.clientCount, 0)} clients trading`,
      up: totalFloatPnl >= 0,
      sparkData: [38,42,45,48,44,46,50,48,49,openPositions],
      icon: <Activity size={14} strokeWidth={2} />,
    },
    {
      label: 'KYC Pending', value: pendingKycCount.toString(), sub: 'Awaiting review',
      delta: pendingKycCount > 10 ? 'High queue' : 'Normal queue', up: pendingKycCount <= 10,
      sparkData: [8,10,12,11,14,13,14,14,14,pendingKycCount],
      icon: <UserCheck size={14} strokeWidth={2} />,
    },
    {
      label: 'Open Alerts', value: openAlertCount.toString(), sub: `${pendingTxCount} tx pending`,
      delta: openAlertCount === 0 ? 'All clear' : `${openAlertCount} need review`, up: openAlertCount === 0,
      sparkData: [1,2,1,3,2,3,4,3,4,openAlertCount],
      icon: <AlertTriangle size={14} strokeWidth={2} />,
    },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Module header */}
      <div className="module-header -mx-6 -mt-6 px-6 pt-5 mb-5">
        <div>
          <h1 className="module-title">Dashboard</h1>
          <p className="module-subtitle">Executive overview — {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map(k => <KPICard key={k.label} {...k} />)}
      </div>

      {/* Main charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <ExposureChart />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TopClients />
        </div>
        <div className="flex flex-col gap-4">
          <ActivityFeed />
          <SystemStatusGrid />
        </div>
      </div>
    </div>
  );
}
