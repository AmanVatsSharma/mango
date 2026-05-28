/**
 * File:        apps/broker-admin/src/app/(admin)/lp-console/page.tsx
 * Module:      broker-admin · Liquidity · LP Routing Console
 * Purpose:     A-book/B-book routing config, LP connection health, and toxic-flow detection
 *
 * Exports:
 *   - default (LPConsolePage) — three tabs: Routing Rules | LP Connections | Toxic Flow
 *
 * Depends on:
 *   - none (all LP data is local state seeded from constants)
 *
 * Side-effects:
 *   - Local state; routing rule edits and LP toggles do not persist
 *
 * Key invariants:
 *   - aBook + bBook always sum to 100 (enforced by clamp on slider input)
 *   - LP latency colors: <50ms green, 50-150ms warn, >150ms red
 *   - Toxic flow: clients flagged where broker P&L on their trades is negative (client wins = broker loses on B-book)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Activity, AlertTriangle, Wifi, WifiOff, Plus } from 'lucide-react';

type RoutingRule = {
  id: string;
  symbol: string;
  group: string;
  aBook: number;
  markupBps: number;
  lpId: string;
  active: boolean;
};

type LP = {
  id: string;
  name: string;
  assetClass: string;
  status: 'Connected' | 'Degraded' | 'Offline';
  latencyMs: number;
  fillRatePct: number;
  slippageAvgBps: number;
  dailyVolume: number;
  lastHeartbeat: string;
};

type ToxicClient = {
  clientId: string;
  clientName: string;
  symbol: string;
  winRate: number;
  brokerPnl: number;
  tradeCount: number;
  action: 'A-Book' | 'Monitor' | 'Flag';
};

const ROUTING_RULES: RoutingRule[] = [
  { id: 'rr1', symbol: 'EUR/USD', group: 'ALL',          aBook: 80, markupBps: 2, lpId: 'lp1', active: true  },
  { id: 'rr2', symbol: 'GBP/USD', group: 'ALL',          aBook: 80, markupBps: 2, lpId: 'lp1', active: true  },
  { id: 'rr3', symbol: 'XAUUSD',  group: 'ALL',          aBook: 60, markupBps: 5, lpId: 'lp2', active: true  },
  { id: 'rr4', symbol: 'BTC/USD', group: 'ALL',          aBook: 40, markupBps: 10, lpId: 'lp3', active: true  },
  { id: 'rr5', symbol: 'EUR/USD', group: 'VIP',          aBook: 100,markupBps: 0, lpId: 'lp1', active: true  },
  { id: 'rr6', symbol: 'ALL',     group: 'Standard',     aBook: 30, markupBps: 8, lpId: 'lp1', active: false },
];

const LPS: LP[] = [
  { id: 'lp1', name: 'Finalto (Prime)',   assetClass: 'FX/CFD',   status: 'Connected', latencyMs: 12,  fillRatePct: 99.4, slippageAvgBps: 0.2, dailyVolume: 48_200_000, lastHeartbeat: '< 1s' },
  { id: 'lp2', name: 'INTL FCStone',      assetClass: 'Metals',   status: 'Connected', latencyMs: 34,  fillRatePct: 98.8, slippageAvgBps: 0.5, dailyVolume: 12_800_000, lastHeartbeat: '< 1s' },
  { id: 'lp3', name: 'B2Prime (Crypto)',  assetClass: 'Crypto',   status: 'Degraded',  latencyMs: 187, fillRatePct: 94.1, slippageAvgBps: 3.2, dailyVolume: 5_100_000,  lastHeartbeat: '8s'   },
  { id: 'lp4', name: 'Sucden Financial',  assetClass: 'Indices',  status: 'Connected', latencyMs: 28,  fillRatePct: 99.1, slippageAvgBps: 0.4, dailyVolume: 9_700_000,  lastHeartbeat: '< 1s' },
  { id: 'lp5', name: 'Backup LP (ECN)',   assetClass: 'FX/CFD',   status: 'Offline',   latencyMs: 0,   fillRatePct: 0,    slippageAvgBps: 0,   dailyVolume: 0,           lastHeartbeat: '> 5m' },
];

const TOXIC_CLIENTS: ToxicClient[] = [
  { clientId: 'C1009', clientName: 'Tariq Hassan',    symbol: 'XAUUSD',  winRate: 87, brokerPnl: -18_420, tradeCount: 214, action: 'A-Book'  },
  { clientId: 'C1022', clientName: 'Omar Al-Farsi',   symbol: 'EUR/USD', winRate: 82, brokerPnl: -11_200, tradeCount: 380, action: 'A-Book'  },
  { clientId: 'C1031', clientName: 'Viktor Petrov',   symbol: 'BTC/USD', winRate: 79, brokerPnl: -8_940,  tradeCount: 156, action: 'Monitor' },
  { clientId: 'C1015', clientName: 'Samuel Okonkwo',  symbol: 'USD/JPY', winRate: 76, brokerPnl: -6_300,  tradeCount: 290, action: 'Monitor' },
  { clientId: 'C1028', clientName: 'Elena Volkov',    symbol: 'GBP/USD', winRate: 74, brokerPnl: -4_100,  tradeCount: 178, action: 'Flag'    },
];

function latencyColor(ms: number) {
  if (ms === 0) return 'text-fg3';
  if (ms < 50) return 'text-bull';
  if (ms < 150) return 'text-warn';
  return 'text-bear';
}

function statusDot(status: LP['status']) {
  if (status === 'Connected') return 'bg-bull animate-pulse';
  if (status === 'Degraded')  return 'bg-warn animate-pulse';
  return 'bg-bear';
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function LPConsolePage() {
  const [tab, setTab] = useState<'routing' | 'connections' | 'toxic'>('routing');
  const [rules, setRules] = useState<RoutingRule[]>(ROUTING_RULES);

  const updateRule = (id: string, field: keyof RoutingRule, value: unknown) =>
    setRules(rs => rs.map(r => r.id === id ? { ...r, [field]: value } : r));

  const connectedCount = LPS.filter(l => l.status === 'Connected').length;
  const degradedCount  = LPS.filter(l => l.status === 'Degraded').length;
  const toxicBrokerPnl = TOXIC_CLIENTS.reduce((s, c) => s + c.brokerPnl, 0);

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">LP Routing Console</p>
          <p className="module-subtitle">
            {connectedCount} LPs connected · {degradedCount > 0 ? `${degradedCount} degraded · ` : ''}
            {TOXIC_CLIENTS.length} toxic-flow clients detected
          </p>
        </div>
        {tab === 'routing' && (
          <button className="btn-primary btn btn-sm"><Plus size={13} /> Add Rule</button>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Connected LPs',    value: `${connectedCount}/${LPS.length}`,            color: 'text-bull',   icon: <Wifi size={15} className="text-bull" /> },
            { label: 'Avg Latency',      value: `${Math.round(LPS.filter(l=>l.latencyMs>0).reduce((s,l)=>s+l.latencyMs,0)/connectedCount)}ms`, color: 'text-accent', icon: <Activity size={15} className="text-accent" /> },
            { label: 'Toxic Clients',    value: TOXIC_CLIENTS.length,                          color: 'text-warn',   icon: <AlertTriangle size={15} className="text-warn" /> },
            { label: 'B-Book P&L Risk',  value: `$${Math.abs(toxicBrokerPnl).toLocaleString()}`, color: 'text-bear', icon: <AlertTriangle size={15} className="text-bear" /> },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <div className="flex items-center justify-between">
                <p className="kpi-label">{k.label}</p>
                {k.icon}
              </div>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="chart-tabs">
          <button className={`chart-tab ${tab === 'routing' ? 'active' : ''}`} onClick={() => setTab('routing')}>
            Routing Rules <span className="ml-1 font-mono text-[9px] text-fg3">{rules.length}</span>
          </button>
          <button className={`chart-tab ${tab === 'connections' ? 'active' : ''}`} onClick={() => setTab('connections')}>
            LP Connections <span className="ml-1 font-mono text-[9px] text-fg3">{LPS.length}</span>
          </button>
          <button className={`chart-tab ${tab === 'toxic' ? 'active' : ''}`} onClick={() => setTab('toxic')}>
            Toxic Flow <span className="ml-1 font-mono text-[9px] text-bear">{TOXIC_CLIENTS.length}</span>
          </button>
        </div>

        {/* Routing rules */}
        {tab === 'routing' && (
          <div className="card overflow-x-auto">
            <table className="data-table" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Group</th>
                  <th>A-Book %</th>
                  <th>B-Book %</th>
                  <th>A-Book Spread</th>
                  <th>Routing LP</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id} style={{ opacity: rule.active ? 1 : 0.5 }}>
                    <td className="mono-cell font-bold text-[13px]">
                      {rule.symbol === 'ALL' ? <span className="text-fg3">All Symbols</span> : rule.symbol}
                    </td>
                    <td>
                      <span className={`badge ${rule.group === 'VIP' ? 'badge-gold' : rule.group === 'ALL' ? 'badge-muted' : 'badge-accent'}`}>
                        {rule.group}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <input type="range" min={0} max={100} value={rule.aBook}
                          className="w-20"
                          onChange={e => updateRule(rule.id, 'aBook', +e.target.value)} />
                        <span className={`mono-cell text-[11px] font-bold ${rule.aBook >= 80 ? 'text-bull' : rule.aBook >= 50 ? 'text-accent' : 'text-warn'}`}>
                          {rule.aBook}%
                        </span>
                      </div>
                    </td>
                    <td className={`mono-cell text-[11px] font-bold ${(100 - rule.aBook) >= 50 ? 'text-warn' : 'text-fg2'}`}>
                      {100 - rule.aBook}%
                    </td>
                    <td className="mono-cell text-[11px] text-fg2">{rule.markupBps} bps</td>
                    <td className="text-[11px] text-fg2">
                      {LPS.find(l => l.id === rule.lpId)?.name ?? '—'}
                    </td>
                    <td>
                      <Toggle on={rule.active} onChange={v => updateRule(rule.id, 'active', v)} />
                    </td>
                    <td>
                      <button className="btn-ghost btn btn-xs">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-[var(--border)] px-4 py-3">
              <p className="text-[10px] text-fg3">
                Rule priority: VIP group → specific symbol → ALL symbol. Higher A-book % = more flow sent to LP; lower risk retained on B-book.
              </p>
            </div>
          </div>
        )}

        {/* LP connections */}
        {tab === 'connections' && (
          <div className="grid grid-cols-1 gap-3">
            {LPS.map(lp => (
              <div key={lp.id} className="card p-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 w-52 shrink-0">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${statusDot(lp.status)}`} />
                    <p className="text-[12px] font-semibold text-fg1">{lp.name}</p>
                  </div>
                  <span className="badge badge-muted shrink-0">{lp.assetClass}</span>
                  <span className={`shrink-0 ${lp.status === 'Connected' ? 'status-active' : lp.status === 'Degraded' ? 'status-pending' : 'status-suspended'}`}>
                    {lp.status}
                  </span>

                  {lp.status !== 'Offline' ? (
                    <>
                      <div className="flex items-center gap-1">
                        <span className="kpi-label">Latency</span>
                        <span className={`mono-cell text-[12px] font-bold ml-1 ${latencyColor(lp.latencyMs)}`}>
                          {lp.latencyMs}ms
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="kpi-label">Fill Rate</span>
                        <span className="mono-cell text-[12px] text-bull ml-1">{lp.fillRatePct}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="kpi-label">Avg Slippage</span>
                        <span className="mono-cell text-[12px] text-fg2 ml-1">{lp.slippageAvgBps} bps</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="kpi-label">Daily Vol</span>
                        <span className="mono-cell text-[12px] text-fg1 ml-1">
                          ${(lp.dailyVolume / 1_000_000).toFixed(1)}M
                        </span>
                      </div>
                      <div className="ml-auto flex items-center gap-1 text-[10px] text-fg3">
                        <Activity size={10} />
                        <span>{lp.lastHeartbeat}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-[11px] text-fg3">
                      <WifiOff size={12} /> Last heartbeat: {lp.lastHeartbeat}
                    </div>
                  )}

                  <div className="ml-auto flex gap-1 shrink-0">
                    <button className="btn-ghost btn btn-xs">Test</button>
                    <button className="btn-ghost btn btn-xs">Config</button>
                  </div>
                </div>

                {lp.status === 'Degraded' && (
                  <div className="mt-3 flex items-center gap-2 rounded border border-warn/20 bg-warn/5 px-3 py-1.5">
                    <AlertTriangle size={11} className="text-warn" />
                    <p className="text-[10px] text-warn">
                      High latency detected ({lp.latencyMs}ms). Fill rate degraded. Consider switching to backup LP.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Toxic flow */}
        {tab === 'toxic' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
              <p className="text-[11px] text-fg2">
                These clients consistently profit against the broker on B-book flow.
                Routing them to A-book eliminates the exposure at the cost of LP markup.
                Total unrealized B-book risk: <strong className="text-bear">${Math.abs(toxicBrokerPnl).toLocaleString()}</strong>
              </p>
            </div>
            <div className="card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Symbol</th>
                    <th>Win Rate</th>
                    <th>Broker P&L (B-book)</th>
                    <th>Trades</th>
                    <th>Recommendation</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {TOXIC_CLIENTS.map(c => (
                    <tr key={c.clientId}>
                      <td>
                        <p className="text-[12px] font-medium text-fg1">{c.clientName}</p>
                        <p className="mono-cell text-[10px] text-fg3">{c.clientId}</p>
                      </td>
                      <td className="mono-cell font-bold text-[12px]">{c.symbol}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-[var(--bg-elevated)]">
                            <div className="h-full rounded-full bg-bull" style={{ width: `${c.winRate}%` }} />
                          </div>
                          <span className="mono-cell text-[11px] text-bull font-bold">{c.winRate}%</span>
                        </div>
                      </td>
                      <td className="mono-cell font-bold text-[12px] text-bear">
                        ${c.brokerPnl.toLocaleString()}
                      </td>
                      <td className="mono-cell text-[11px] text-fg2">{c.tradeCount}</td>
                      <td>
                        <span className={`badge ${c.action === 'A-Book' ? 'badge-bull' : c.action === 'Monitor' ? 'badge-warn' : 'badge-bear'}`}>
                          {c.action}
                        </span>
                      </td>
                      <td>
                        <button className="btn-primary btn btn-xs">Force A-Book</button>
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
