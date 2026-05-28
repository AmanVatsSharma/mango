/**
 * File:        apps/broker-admin/src/app/(admin)/scheduled-reports/page.tsx
 * Module:      broker-admin · Reports · Scheduled Reports
 * Purpose:     Manage automated report delivery schedules — cron config, recipients, last/next run status
 *
 * Exports:
 *   - default (ScheduledReportsPage) — schedule list with enable/disable, run-now, and edit actions
 *
 * Depends on:
 *   - none (all data is local state)
 *
 * Side-effects:
 *   - Local state only; run-now simulates with 2s loading then updates lastRun
 *
 * Key invariants:
 *   - Each schedule: report type + cron frequency + recipient list + format
 *   - nextRun is display-only (derived from frequency in real implementation)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Clock, Play, Plus, Mail } from 'lucide-react';

type ScheduleFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly';
type ReportFormat = 'PDF' | 'CSV' | 'Excel' | 'JSON';

type ScheduledReport = {
  id: string;
  name: string;
  reportType: string;
  frequency: ScheduleFrequency;
  dayTime: string;
  recipients: string[];
  format: ReportFormat;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string;
  lastStatus: 'Success' | 'Failed' | 'Running' | null;
};

const INIT_SCHEDULES: ScheduledReport[] = [
  {
    id: 'S001', name: 'Daily Client Activity Digest', reportType: 'Client Activity',
    frequency: 'Daily', dayTime: 'Every day at 07:00 UTC', format: 'PDF',
    recipients: ['ops@broker.com', 'compliance@broker.com'],
    enabled: true, lastRun: '2024-01-15 07:00', nextRun: '2024-01-16 07:00', lastStatus: 'Success',
  },
  {
    id: 'S002', name: 'Weekly P&L Summary', reportType: 'Broker P&L',
    frequency: 'Weekly', dayTime: 'Every Monday at 08:00 UTC', format: 'Excel',
    recipients: ['cfo@broker.com', 'ceo@broker.com'],
    enabled: true, lastRun: '2024-01-15 08:00', nextRun: '2024-01-22 08:00', lastStatus: 'Success',
  },
  {
    id: 'S003', name: 'KYC Pending Alert', reportType: 'KYC Queue',
    frequency: 'Daily', dayTime: 'Every day at 09:00 UTC', format: 'CSV',
    recipients: ['kyc@broker.com'],
    enabled: true, lastRun: '2024-01-15 09:00', nextRun: '2024-01-16 09:00', lastStatus: 'Success',
  },
  {
    id: 'S004', name: 'Monthly IB Commission Statement', reportType: 'IB Commissions',
    frequency: 'Monthly', dayTime: '1st of month at 06:00 UTC', format: 'PDF',
    recipients: ['finance@broker.com'],
    enabled: true, lastRun: '2024-01-01 06:00', nextRun: '2024-02-01 06:00', lastStatus: 'Success',
  },
  {
    id: 'S005', name: 'Risk Exposure Snapshot', reportType: 'Risk Dashboard',
    frequency: 'Daily', dayTime: 'Every day at 18:00 UTC', format: 'PDF',
    recipients: ['risk@broker.com', 'dealing@broker.com'],
    enabled: false, lastRun: '2024-01-10 18:00', nextRun: '—', lastStatus: 'Success',
  },
  {
    id: 'S006', name: 'Quarterly Regulatory Package', reportType: 'Regulatory',
    frequency: 'Quarterly', dayTime: '1st day of quarter at 00:00 UTC', format: 'PDF',
    recipients: ['compliance@broker.com', 'legal@broker.com', 'ceo@broker.com'],
    enabled: true, lastRun: '2024-01-01 00:00', nextRun: '2024-04-01 00:00', lastStatus: 'Failed',
  },
  {
    id: 'S007', name: 'Weekly AML Suspicious Activity', reportType: 'AML Monitor',
    frequency: 'Weekly', dayTime: 'Every Friday at 17:00 UTC', format: 'CSV',
    recipients: ['aml@broker.com', 'compliance@broker.com'],
    enabled: true, lastRun: '2024-01-12 17:00', nextRun: '2024-01-19 17:00', lastStatus: 'Success',
  },
];

const FREQ_BADGE: Record<ScheduleFrequency, string> = {
  Daily:     'badge-accent',
  Weekly:    'badge-bull',
  Monthly:   'badge-warn',
  Quarterly: 'badge-purple',
};

const FORMAT_BADGE: Record<ReportFormat, string> = {
  PDF:   'badge-bear',
  CSV:   'badge-muted',
  Excel: 'badge-bull',
  JSON:  'badge-accent',
};

export default function ScheduledReportsPage() {
  const [schedules, setSchedules] = useState<ScheduledReport[]>(INIT_SCHEDULES);
  const [running, setRunning] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSchedules(ss => ss.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));

  const runNow = (id: string) => {
    setRunning(r => new Set(r).add(id));
    setTimeout(() => {
      setSchedules(ss => ss.map(s => s.id === id
        ? { ...s, lastRun: '2024-01-15 (manual)', lastStatus: 'Success' }
        : s));
      setRunning(r => { const n = new Set(r); n.delete(id); return n; });
    }, 2000);
  };

  const activeCount = schedules.filter(s => s.enabled).length;
  const failedCount = schedules.filter(s => s.lastStatus === 'Failed').length;

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Scheduled Reports</p>
          <p className="module-subtitle">
            {activeCount} active schedules · {failedCount} failed last run
          </p>
        </div>
        <button className="btn-primary btn btn-sm"><Plus size={13} /> New Schedule</button>
      </div>

      <div className="p-6 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Active Schedules', value: activeCount,                                                  color: 'text-bull'   },
            { label: 'Total Schedules',  value: schedules.length,                                             color: 'text-fg1'    },
            { label: 'Failed Last Run',  value: failedCount,                                                   color: failedCount > 0 ? 'text-bear' : 'text-bull' },
            { label: 'Total Recipients', value: [...new Set(schedules.flatMap(s => s.recipients))].length,    color: 'text-accent' },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <p className="kpi-label">{k.label}</p>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Schedule</th>
                <th>Frequency</th>
                <th>Timing</th>
                <th>Format</th>
                <th>Recipients</th>
                <th>Last Run</th>
                <th>Last Status</th>
                <th>Next Run</th>
                <th>Enabled</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Clock size={12} className={s.enabled ? 'text-accent' : 'text-fg3'} />
                      <div>
                        <p className="text-[12px] font-medium text-fg1">{s.name}</p>
                        <p className="text-[10px] text-fg3">{s.reportType}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className={`badge ${FREQ_BADGE[s.frequency]}`}>{s.frequency}</span></td>
                  <td className="text-[10px] text-fg3">{s.dayTime}</td>
                  <td><span className={`badge ${FORMAT_BADGE[s.format]}`}>{s.format}</span></td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {s.recipients.slice(0, 2).map(r => (
                        <span key={r} className="flex items-center gap-0.5 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[9px] text-fg3">
                          <Mail size={8} />{r.split('@')[0]}
                        </span>
                      ))}
                      {s.recipients.length > 2 && (
                        <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[9px] text-fg3">
                          +{s.recipients.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="mono-cell text-[10px] text-fg3">{s.lastRun ?? '—'}</td>
                  <td>
                    {s.lastStatus === 'Success' && <span className="status-active">Success</span>}
                    {s.lastStatus === 'Failed'  && <span className="status-suspended">Failed</span>}
                    {s.lastStatus === null && <span className="text-[10px] text-fg3">—</span>}
                    {running.has(s.id) && <span className="status-pending">Running…</span>}
                  </td>
                  <td className="mono-cell text-[10px] text-fg2">{s.enabled ? s.nextRun : '—'}</td>
                  <td>
                    <button onClick={() => toggle(s.id)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${s.enabled ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${s.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn-ghost btn btn-xs" onClick={() => runNow(s.id)} disabled={running.has(s.id)}>
                        <Play size={10} className={running.has(s.id) ? 'animate-spin' : ''} />
                        {running.has(s.id) ? '' : 'Run'}
                      </button>
                      <button className="btn-ghost btn btn-xs">Edit</button>
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
