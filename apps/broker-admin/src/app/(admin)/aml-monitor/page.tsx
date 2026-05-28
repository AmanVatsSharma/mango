/**
 * File:        apps/broker-admin/src/app/(admin)/aml-monitor/page.tsx
 * Module:      broker-admin · Risk · AML Monitor
 * Purpose:     AML case management with risk score distribution, case queue, and case detail
 *
 * Exports:
 *   - default (AMLMonitorPage) — AML score overview, suspicious transaction patterns, case queue
 *
 * Depends on:
 *   - @/lib/mock-data-context — useBrokerData() for clients, transactions, surveillance
 *
 * Side-effects:
 *   - none (read-only analytics derived from existing data)
 *
 * Key invariants:
 *   - AML score derived from client.amlScore field
 *   - Flagged transactions shown separately from surveillance pattern alerts
 *   - Risk bands: Low 0-25, Medium 26-50, High 51-75, Critical 76-100
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertTriangle, Shield, Activity } from 'lucide-react';
import { useBrokerData } from '@/lib/mock-data-context';
import { useAmlMonitor } from '@/lib/api/hooks/use-aml-monitor';
import type { AMLCase } from '@/lib/types';

const RISK_BANDS = [
  { label: '0–25',   color: 'var(--bull)',    bg: 'bg-bull/10',   text: 'text-bull'   },
  { label: '26–50',  color: 'var(--warn)',    bg: 'bg-warn/10',   text: 'text-warn'   },
  { label: '51–75',  color: 'var(--bear)',    bg: 'bg-bear/10',   text: 'text-bear'   },
  { label: '76–100', color: '#FF0040',        bg: 'bg-bear/20',   text: 'text-bear'   },
];

const AML_PATTERNS = [
  { id: 'P001', pattern: 'Structuring',       description: 'Multiple deposits just below reporting threshold', clientIds: ['C1009', 'C1015'], severity: 'Critical' },
  { id: 'P002', pattern: 'Round-Trip Funds',  description: 'Deposit and immediate withdrawal without trading', clientIds: ['C1022'],          severity: 'High'     },
  { id: 'P003', pattern: 'Rapid Movement',    description: 'Funds moved between accounts within 24h',         clientIds: ['C1028'],          severity: 'High'     },
  { id: 'P004', pattern: 'PEP Match',         description: 'Client name matches Politically Exposed Person list', clientIds: ['C1031'],       severity: 'Critical' },
  { id: 'P005', pattern: 'High-Risk Country', description: 'Transactions from FATF blacklisted jurisdiction',  clientIds: ['C1009'],          severity: 'High'     },
];

const SEVERITY_COLOR: Record<string, string> = {
  Critical: 'severity-critical',
  High:     'severity-high',
  Medium:   'severity-medium',
  Low:      'severity-low',
};

export default function AMLMonitorPage() {
  const { clients, transactions } = useBrokerData();
  const { cases: amlCases } = useAmlMonitor();
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);

  const amlScores = useMemo(() =>
    clients.map(c => c.amlScore).filter((s): s is number => s !== undefined && s !== null),
    [clients]
  );

  const distribution = useMemo(() => {
    const bands = [0, 0, 0, 0];
    amlScores.forEach(s => {
      if (s <= 25) bands[0]++;
      else if (s <= 50) bands[1]++;
      else if (s <= 75) bands[2]++;
      else bands[3]++;
    });
    return RISK_BANDS.map((b, i) => ({ ...b, count: bands[i] }));
  }, [amlScores]);

  const highRiskClients = useMemo(() =>
    clients.filter(c => (c.amlScore ?? 0) > 50).sort((a, b) => (b.amlScore ?? 0) - (a.amlScore ?? 0)),
    [clients]
  );

  const flaggedTxns = useMemo(() =>
    transactions.filter(t => t.flagged),
    [transactions]
  );

  const openAmlCases = useMemo(() =>
    amlCases.filter(c => c.status === 'Review' || c.status === 'Suspicious' || c.status === 'Reported').length,
    [amlCases]
  );

  const chartData = distribution.map(d => ({ name: d.label, count: d.count, color: d.color }));

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">AML Monitor</p>
          <p className="module-subtitle">
            {highRiskClients.length} high-risk clients ·{' '}
            {flaggedTxns.length} flagged transactions ·{' '}
            {openAmlCases} open AML cases
          </p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'High-Risk Clients',    value: highRiskClients.length,                         icon: <AlertTriangle size={16} className="text-bear" />,   color: 'text-bear'   },
            { label: 'Flagged Transactions', value: flaggedTxns.length,                              icon: <Activity size={16} className="text-warn" />,        color: 'text-warn'   },
            { label: 'Open AML Cases',      value: openAmlCases,                                    icon: <Shield size={16} className="text-accent" />,        color: 'text-accent' },
            { label: 'Avg Risk Score',       value: (amlScores.reduce((s,n)=>s+n,0)/Math.max(1,amlScores.length)).toFixed(1), icon: <Activity size={16} className="text-fg2" />, color: 'text-fg1' },
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

        <div className="grid grid-cols-2 gap-5">
          {/* AML score distribution chart */}
          <div className="card p-4">
            <p className="card-title mb-4">AML Score Distribution</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--fg3)', fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--fg3)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {distribution.map(d => (
                <div key={d.label} className={`rounded p-2 text-center ${d.bg}`}>
                  <p className={`mono-cell text-[14px] font-bold ${d.text}`}>{d.count}</p>
                  <p className="text-[9px] text-fg3">{d.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Detected patterns */}
          <div className="card">
            <div className="card-header">
              <p className="card-title">Detected Patterns</p>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {AML_PATTERNS.map(p => (
                <button
                  key={p.id}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] ${selectedPattern === p.id ? 'bg-[var(--bg-hover)]' : ''}`}
                  onClick={() => setSelectedPattern(selectedPattern === p.id ? null : p.id)}
                >
                  <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${SEVERITY_COLOR[p.severity]?.replace('severity-', 'bg-')} ${p.severity === 'Critical' ? 'bg-bear' : p.severity === 'High' ? 'bg-warn' : 'bg-gold'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-fg1">{p.pattern}</p>
                    <p className="text-[10px] text-fg3 mt-0.5">{p.description}</p>
                    {selectedPattern === p.id && (
                      <div className="mt-2 flex gap-2">
                        {p.clientIds.map(id => (
                          <span key={id} className="mono-cell text-[10px] text-accent">{id}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className={`badge ${p.severity === 'Critical' ? 'badge-bear' : 'badge-warn'} shrink-0`}>{p.severity}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* High-risk clients table */}
        {highRiskClients.length > 0 && (
          <div className="card overflow-x-auto">
            <div className="card-header">
              <p className="card-title">High-Risk Clients (Score &gt; 50)</p>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>AML Score</th>
                  <th>Country</th>
                  <th>KYC</th>
                  <th>Balance</th>
                  <th>Flagged Txns</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {highRiskClients.slice(0, 10).map(c => {
                  const score = c.amlScore ?? 0;
                  const scoreColor = score > 75 ? 'text-bear' : 'text-warn';
                  const clientFlaggedTxns = transactions.filter(t => t.clientId === c.id && t.flagged).length;
                  return (
                    <tr key={c.id}>
                      <td>
                        <p className="text-[12px] font-medium text-fg1">{c.name}</p>
                        <p className="mono-cell text-[10px] text-fg3">{c.id}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-[var(--bg-elevated)]">
                            <div className={`h-full rounded-full ${score > 75 ? 'bg-bear' : 'bg-warn'}`} style={{ width: `${score}%` }} />
                          </div>
                          <span className={`mono-cell text-[11px] font-bold ${scoreColor}`}>{score}</span>
                        </div>
                      </td>
                      <td className="text-[12px]">{c.flag} {c.country}</td>
                      <td><span className={`kyc-${c.kyc.toLowerCase()}`}>{c.kyc}</span></td>
                      <td className="mono-cell text-[12px] text-fg1">${c.balance.toLocaleString()}</td>
                      <td>
                        {clientFlaggedTxns > 0
                          ? <span className="badge badge-warn">{clientFlaggedTxns}</span>
                          : <span className="text-[11px] text-fg3">0</span>}
                      </td>
                      <td><span className={`status-${c.status.toLowerCase()}`}>{c.status}</span></td>
                      <td>
                        <button className="btn-ghost btn btn-xs">Review</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Flagged transactions */}
        {flaggedTxns.length > 0 && (
          <div className="card overflow-x-auto">
            <div className="card-header">
              <p className="card-title">Flagged Transactions</p>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Notes</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {flaggedTxns.map(t => (
                  <tr key={t.id}>
                    <td className="mono-cell text-[11px] text-fg3">{t.id}</td>
                    <td>
                      <p className="text-[12px] font-medium text-fg1">{t.clientName}</p>
                      <p className="mono-cell text-[10px] text-fg3">{t.clientId}</p>
                    </td>
                    <td><span className={`badge ${t.type === 'Withdrawal' ? 'badge-bear' : 'badge-bull'}`}>{t.type}</span></td>
                    <td className="mono-cell font-bold text-[12px] text-warn">${t.amount.toLocaleString()}</td>
                    <td className="text-[11px] text-fg2">{t.method}</td>
                    <td className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-warn">{t.notes ?? '—'}</td>
                    <td className="mono-cell text-[10px] text-fg3">{t.createdAt}</td>
                    <td><span className={`status-${t.status.toLowerCase().replace(' ', '')}`}>{t.status}</span></td>
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
