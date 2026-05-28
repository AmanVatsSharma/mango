/**
 * File:        apps/broker-admin/src/app/(admin)/surveillance/page.tsx
 * Module:      broker-admin · Risk · Surveillance
 * Purpose:     Surveillance alert management — open/investigating/resolved queue with detail panel
 *
 * Exports:
 *   - default (SurveillancePage) — tabbed alert list + slide-in detail + action buttons
 *
 * Depends on:
 *   - @/lib/mock-data-context — useBrokerData() for surveillance, resolveAlert()
 *
 * Side-effects:
 *   - resolveAlert(id, resolution) updates alert status in context
 *
 * Key invariants:
 *   - Status transitions: Open → Investigating → Resolved / Escalated
 *   - resolveAlert requires 2 args: (alertId, resolution string)
 *   - AlertSeverity: 'Critical' | 'High' | 'Medium' | 'Low' (not 'HIGH'/'MEDIUM')
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Shield, Download } from 'lucide-react';
import { useBrokerData } from '@/lib/mock-data-context';
import type { SurveillanceAlert, AlertSeverity } from '@/lib/types';

type StatusFilter = 'Open' | 'Under Review' | 'Resolved' | 'All';

const SEV_BADGE: Record<AlertSeverity, string> = {
  Critical: 'badge-bear',
  High:     'badge-warn',
  Medium:   'badge badge-accent',
  Low:      'badge-muted',
};

const STATUS_BADGE: Record<SurveillanceAlert['status'], string> = {
  Open:          'status-suspended',
  'Under Review':'status-pending',
  Resolved:      'status-active',
  Escalated:     'badge badge-purple',
};

const TABS: { label: StatusFilter; filter: (a: SurveillanceAlert) => boolean }[] = [
  { label: 'Open',        filter: a => a.status === 'Open' },
  { label: 'Under Review',filter: a => a.status === 'Under Review' },
  { label: 'Resolved',    filter: a => a.status === 'Resolved' || a.status === 'Escalated' },
  { label: 'All',         filter: () => true },
];

export default function SurveillancePage() {
  const { surveillance, resolveAlert } = useBrokerData();
  const [tab, setTab] = useState<StatusFilter>('Open');
  const [selected, setSelected] = useState<SurveillanceAlert | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const current = TABS.find(t => t.label === tab)!;
  const displayed = surveillance.filter(current.filter);

  const openCount = surveillance.filter(a => a.status === 'Open').length;
  const highCount = surveillance.filter(a => (a.severity === 'Critical' || a.severity === 'High') && a.status === 'Open').length;

  const markInvestigating = (id: string) => resolveAlert(id, 'Under investigation');
  const markResolved = (id: string) => {
    resolveAlert(id, resolutionNote || 'Reviewed and closed');
    setResolutionNote('');
    setSelected(null);
  };
  const escalate = (id: string) => {
    resolveAlert(id, 'Escalated to compliance team');
    setSelected(null);
  };

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Surveillance</p>
          <p className="module-subtitle">
            {openCount} open · {highCount} high-severity
          </p>
        </div>
        <button className="btn-ghost btn btn-sm">
          <Download size={13} /> Export History
        </button>
      </div>

      <div className="p-6 space-y-4">
        {/* Tabs */}
        <div className="chart-tabs">
          {TABS.map(t => {
            const count = surveillance.filter(t.filter).length;
            return (
              <button key={t.label} className={`chart-tab ${tab === t.label ? 'active' : ''}`}
                onClick={() => setTab(t.label)}>
                {t.label}
                {count > 0 && <span className="ml-1 font-mono text-[9px] text-fg3">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className={`grid gap-4 ${selected ? 'grid-cols-[1fr_380px]' : 'grid-cols-1'}`}>
          {/* Alert list */}
          <div className="card overflow-x-auto">
            {displayed.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <Shield size={28} className="mb-3 text-fg3" />
                <p className="text-[12px] font-medium text-fg2">No {tab.toLowerCase()} alerts</p>
                <p className="mt-1 text-[11px] text-fg3">All clear in this category</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Pattern</th>
                    <th>Client</th>
                    <th>Detected</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(alert => (
                    <tr
                      key={alert.id}
                      className="cursor-pointer"
                      style={{ background: selected?.id === alert.id ? 'var(--bg-hover)' : '' }}
                      onClick={() => setSelected(alert)}
                    >
                      <td>
                        <span className={`badge ${SEV_BADGE[alert.severity]}`}>{alert.severity}</span>
                      </td>
                      <td className="text-[12px] font-medium text-fg1">{alert.pattern}</td>
                      <td>
                        <p className="text-[12px] text-fg1">{alert.clientName}</p>
                        <p className="mono-cell text-[10px] text-fg3">{alert.clientId}</p>
                      </td>
                      <td className="mono-cell text-[10px] text-fg3 whitespace-nowrap">{alert.detectedAt}</td>
                      <td>
                        <span className={STATUS_BADGE[alert.status]}>{alert.status}</span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {alert.status === 'Open' && (
                            <button className="btn-ghost btn btn-xs"
                              onClick={() => markInvestigating(alert.id)}>
                              Investigate
                            </button>
                          )}
                          {(alert.status === 'Open' || alert.status === 'Under Review') && (
                            <button className="btn-primary btn btn-xs"
                              onClick={() => { setSelected(alert); setResolutionNote(''); }}>
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="card flex flex-col gap-0 p-0 overflow-hidden">
              <div className="flex items-start justify-between border-b border-[var(--border)] px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-fg1">{selected.pattern}</p>
                  <p className="mono-cell text-[10px] text-fg3 mt-0.5">{selected.id}</p>
                </div>
                <span className={`badge ${SEV_BADGE[selected.severity]}`}>{selected.severity}</span>
              </div>

              <div className="space-y-3 p-4 text-[11px]">
                <div>
                  <p className="kpi-label mb-1">Client</p>
                  <p className="text-fg1 font-medium">{selected.clientName}</p>
                  <p className="mono-cell text-fg3">{selected.clientId}</p>
                </div>
                <div>
                  <p className="kpi-label mb-1">Description</p>
                  <p className="text-fg2 leading-relaxed">{selected.description}</p>
                </div>
                <div>
                  <p className="kpi-label mb-1">Detected</p>
                  <p className="mono-cell text-fg2">{selected.detectedAt}</p>
                </div>
                {selected.assignedTo && (
                  <div>
                    <p className="kpi-label mb-1">Assigned To</p>
                    <p className="text-fg1">{selected.assignedTo}</p>
                  </div>
                )}
                {selected.trades.length > 0 && (
                  <div>
                    <p className="kpi-label mb-1">Related Trades ({selected.trades.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {selected.trades.map(t => (
                        <span key={t} className="mono-cell text-[10px] badge badge-muted">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selected.resolution && (
                  <div>
                    <p className="kpi-label mb-1">Resolution</p>
                    <p className="text-fg2 italic">{selected.resolution}</p>
                  </div>
                )}
              </div>

              {(selected.status === 'Open' || selected.status === 'Under Review') && (
                <div className="mt-auto border-t border-[var(--border)] p-4 space-y-2">
                  <label className="kpi-label block">Resolution Note</label>
                  <textarea
                    className="input w-full resize-none text-[11px]"
                    rows={2}
                    placeholder="Enter resolution notes..."
                    value={resolutionNote}
                    onChange={e => setResolutionNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button className="btn-primary btn btn-sm flex-1"
                      onClick={() => markResolved(selected.id)}>
                      Mark Resolved
                    </button>
                    <button className="btn-danger btn btn-sm"
                      onClick={() => escalate(selected.id)}>
                      Escalate
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
