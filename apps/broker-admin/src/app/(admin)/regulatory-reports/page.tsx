/**
 * File:        apps/broker-admin/src/app/(admin)/regulatory-reports/page.tsx
 * Module:      broker-admin · Reports · Regulatory Reports
 * Purpose:     Jurisdictional compliance report submissions — status tracking, deadlines, and filing history
 *
 * Exports:
 *   - default (RegulatoryReportsPage) — two tabs: Obligations | Filing History
 *
 * Depends on:
 *   - none (all data is local constants)
 *
 * Side-effects:
 *   - Local state only; submit action updates status without persisting
 *
 * Key invariants:
 *   - Overdue = dueDate in the past and status not Submitted
 *   - Each obligation belongs to a regulatory body and jurisdiction
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText } from 'lucide-react';

type ObligationStatus = 'Submitted' | 'Pending' | 'Overdue' | 'Draft';

type Obligation = {
  id: string;
  name: string;
  regulator: string;
  jurisdiction: string;
  frequency: string;
  dueDate: string;
  status: ObligationStatus;
  period: string;
  submittedDate?: string;
  assignee: string;
  notes: string;
};

type FilingRecord = {
  id: string;
  name: string;
  regulator: string;
  period: string;
  submittedDate: string;
  submittedBy: string;
  format: string;
  reference: string;
  status: 'Accepted' | 'Rejected' | 'Pending Review';
};

const INIT_OBLIGATIONS: Obligation[] = [
  { id: 'OB001', name: 'Transaction Reporting (EMIR)',   regulator: 'ESMA',  jurisdiction: 'EU',  frequency: 'Daily',     dueDate: '2024-01-16', status: 'Pending',   period: 'Jan 15 2024',  assignee: 'Emma L.',   notes: 'Trade repository: DTCC' },
  { id: 'OB002', name: 'Best Execution Report (RTS 27)', regulator: 'FCA',   jurisdiction: 'UK',  frequency: 'Quarterly', dueDate: '2024-01-31', status: 'Draft',     period: 'Q4 2023',       assignee: 'Tom B.',    notes: '' },
  { id: 'OB003', name: 'Capital Adequacy Report',        regulator: 'CySEC', jurisdiction: 'CY',  frequency: 'Monthly',   dueDate: '2024-01-20', status: 'Pending',   period: 'Dec 2023',      assignee: 'Emma L.',   notes: 'ICAAP supplement required' },
  { id: 'OB004', name: 'AML/CTF Suspicious Activity',    regulator: 'FCA',   jurisdiction: 'UK',  frequency: 'Monthly',   dueDate: '2024-01-15', status: 'Submitted', period: 'Dec 2023',      assignee: 'Tom B.',    notes: '', submittedDate: '2024-01-12' },
  { id: 'OB005', name: 'MiFIR Transaction Report',       regulator: 'FCA',   jurisdiction: 'UK',  frequency: 'Daily',     dueDate: '2024-01-15', status: 'Overdue',   period: 'Jan 14 2024',   assignee: 'Emma L.',   notes: 'API submission failed — manual required' },
  { id: 'OB006', name: 'Investor Compensation Fund Levy',regulator: 'CySEC', jurisdiction: 'CY',  frequency: 'Annual',    dueDate: '2024-03-31', status: 'Pending',   period: 'FY 2023',       assignee: 'Alex K.',   notes: '' },
  { id: 'OB007', name: 'FATCA/CRS Reporting',            regulator: 'IRS / OECD', jurisdiction: 'US/Global', frequency: 'Annual', dueDate: '2024-03-15', status: 'Draft', period: 'FY 2023', assignee: 'Tom B.', notes: 'Legal review in progress' },
  { id: 'OB008', name: 'Short Selling Disclosure',       regulator: 'ESMA',  jurisdiction: 'EU',  frequency: 'Ad-hoc',    dueDate: '2024-01-16', status: 'Submitted', period: 'Jan 15 2024',   assignee: 'Alex K.',   notes: '', submittedDate: '2024-01-15' },
];

const FILINGS: FilingRecord[] = [
  { id: 'F001', name: 'AML/CTF Suspicious Activity',    regulator: 'FCA',   period: 'Nov 2023', submittedDate: '2023-12-12', submittedBy: 'Tom B.',   format: 'XML',  reference: 'FCA-2023-11-3841', status: 'Accepted' },
  { id: 'F002', name: 'Transaction Reporting (EMIR)',    regulator: 'ESMA',  period: 'Dec 2023', submittedDate: '2024-01-02', submittedBy: 'Emma L.',  format: 'CSV',  reference: 'DTCC-2024-0102-A',  status: 'Accepted' },
  { id: 'F003', name: 'Capital Adequacy Report',         regulator: 'CySEC', period: 'Nov 2023', submittedDate: '2023-12-18', submittedBy: 'Emma L.',  format: 'PDF',  reference: 'CY-CAP-23-11',     status: 'Accepted' },
  { id: 'F004', name: 'Best Execution Report (RTS 27)',  regulator: 'FCA',   period: 'Q3 2023',  submittedDate: '2023-10-31', submittedBy: 'Tom B.',   format: 'PDF',  reference: 'FCA-RTS27-Q32023',  status: 'Pending Review' },
  { id: 'F005', name: 'MiFIR Transaction Report',        regulator: 'FCA',   period: 'Dec 30',   submittedDate: '2024-01-02', submittedBy: 'Emma L.',  format: 'XML',  reference: 'FCA-MIF-20240102',  status: 'Rejected' },
];

const OB_STATUS_CONF: Record<ObligationStatus, { cls: string; icon: React.ReactNode }> = {
  Submitted: { cls: 'status-active',    icon: <CheckCircle size={11} className="text-bull" /> },
  Pending:   { cls: 'status-pending',   icon: <Clock size={11} className="text-warn" /> },
  Overdue:   { cls: 'status-suspended', icon: <AlertTriangle size={11} className="text-bear" /> },
  Draft:     { cls: 'badge badge-muted',icon: <FileText size={11} className="text-fg3" /> },
};

const FILING_STATUS: Record<FilingRecord['status'], string> = {
  'Accepted':       'status-active',
  'Rejected':       'status-suspended',
  'Pending Review': 'status-pending',
};

export default function RegulatoryReportsPage() {
  const [tab, setTab] = useState<'obligations' | 'history'>('obligations');
  const [obligations, setObligations] = useState<Obligation[]>(INIT_OBLIGATIONS);
  const [filterStatus, setFilterStatus] = useState<ObligationStatus | 'All'>('All');

  const submit = (id: string) =>
    setObligations(os => os.map(o => o.id === id
      ? { ...o, status: 'Submitted', submittedDate: '2024-01-15 (manual)' }
      : o));

  const overdueCount = obligations.filter(o => o.status === 'Overdue').length;
  const pendingCount = obligations.filter(o => o.status === 'Pending').length;
  const submittedCount = obligations.filter(o => o.status === 'Submitted').length;

  const filtered = filterStatus === 'All' ? obligations : obligations.filter(o => o.status === filterStatus);

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Regulatory Reports</p>
          <p className="module-subtitle">
            {overdueCount > 0 && <span className="text-bear">{overdueCount} overdue · </span>}
            {pendingCount} pending · {submittedCount} submitted
          </p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Overdue',   value: overdueCount,  color: overdueCount > 0 ? 'text-bear' : 'text-bull' },
            { label: 'Pending',   value: pendingCount,  color: 'text-warn' },
            { label: 'Submitted', value: submittedCount,color: 'text-bull' },
            { label: 'Draft',     value: obligations.filter(o => o.status === 'Draft').length, color: 'text-fg3' },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <p className="kpi-label">{k.label}</p>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {overdueCount > 0 && (
          <div className="flex items-center gap-2 rounded border border-bear/30 bg-bear/10 px-4 py-2.5">
            <AlertTriangle size={14} className="text-bear shrink-0" />
            <p className="text-[11px] text-bear font-medium">
              {overdueCount} obligation{overdueCount > 1 ? 's are' : ' is'} overdue — immediate action required to avoid regulatory penalties.
            </p>
          </div>
        )}

        <div className="chart-tabs">
          <button className={`chart-tab ${tab === 'obligations' ? 'active' : ''}`} onClick={() => setTab('obligations')}>
            Obligations <span className="ml-1 font-mono text-[9px] text-fg3">{obligations.length}</span>
          </button>
          <button className={`chart-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            Filing History <span className="ml-1 font-mono text-[9px] text-fg3">{FILINGS.length}</span>
          </button>
        </div>

        {/* ── Obligations Tab ── */}
        {tab === 'obligations' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(['All', 'Overdue', 'Pending', 'Draft', 'Submitted'] as const).map(s => (
                <button key={s}
                  className={`btn btn-xs ${filterStatus === s ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilterStatus(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Obligation</th>
                    <th>Regulator</th>
                    <th>Jurisdiction</th>
                    <th>Period</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const conf = OB_STATUS_CONF[o.status];
                    return (
                      <tr key={o.id} className={o.status === 'Overdue' ? 'bg-bear/5' : ''}>
                        <td>
                          <div className="flex items-center gap-2">
                            {conf.icon}
                            <p className="text-[11px] font-medium text-fg1">{o.name}</p>
                          </div>
                        </td>
                        <td><span className="badge badge-muted">{o.regulator}</span></td>
                        <td className="text-[10px] text-fg2">{o.jurisdiction}</td>
                        <td className="mono-cell text-[10px] text-fg3">{o.period}</td>
                        <td className={`mono-cell text-[11px] font-semibold ${o.status === 'Overdue' ? 'text-bear' : 'text-fg2'}`}>
                          {o.dueDate}
                        </td>
                        <td><span className={conf.cls}>{o.status}</span></td>
                        <td className="text-[10px] text-fg2">{o.assignee}</td>
                        <td className="text-[10px] text-fg3 max-w-[140px] truncate">{o.notes || '—'}</td>
                        <td>
                          {(o.status === 'Pending' || o.status === 'Overdue' || o.status === 'Draft') && (
                            <button className={`btn btn-xs ${o.status === 'Overdue' ? 'btn-danger' : 'btn-primary'}`}
                              onClick={() => submit(o.id)}>
                              Submit
                            </button>
                          )}
                          {o.status === 'Submitted' && (
                            <span className="mono-cell text-[9px] text-fg3">{o.submittedDate}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Filing History Tab ── */}
        {tab === 'history' && (
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Regulator</th>
                  <th>Period</th>
                  <th>Submitted</th>
                  <th>By</th>
                  <th>Format</th>
                  <th>Reference</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {FILINGS.map(f => (
                  <tr key={f.id}>
                    <td className="text-[11px] font-medium text-fg1">{f.name}</td>
                    <td><span className="badge badge-muted">{f.regulator}</span></td>
                    <td className="mono-cell text-[10px] text-fg3">{f.period}</td>
                    <td className="mono-cell text-[10px] text-fg2">{f.submittedDate}</td>
                    <td className="text-[10px] text-fg2">{f.submittedBy}</td>
                    <td><span className="badge badge-accent">{f.format}</span></td>
                    <td className="mono-cell text-[9px] text-fg3">{f.reference}</td>
                    <td><span className={FILING_STATUS[f.status]}>{f.status}</span></td>
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
