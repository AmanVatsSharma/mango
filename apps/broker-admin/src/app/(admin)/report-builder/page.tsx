/**
 * File:        apps/broker-admin/src/app/(admin)/report-builder/page.tsx
 * Module:      broker-admin · Reports · Report Builder
 * Purpose:     6-step wizard to configure, preview, and generate custom reports
 *
 * Exports:
 *   - default (ReportBuilderPage) — catalog grid + builder wizard with step indicator
 *
 * Depends on:
 *   - none (all catalog/preview data is local constants)
 *
 * Side-effects:
 *   - Mock generate: 1.8s fake delay then "generated" state
 *
 * Key invariants:
 *   - Step 1 (catalog selection) → Steps 2-6 (configure) → Generate/Download
 *   - Steps are clickable for back-navigation; completed steps show checkmark
 *   - Col selection uses Set for O(1) toggle; serialized to array for display
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { ChevronLeft, Download, RefreshCw, FileText } from 'lucide-react';

type ReportEntry = {
  id: string;
  name: string;
  category: string;
  desc: string;
};

const REPORT_CATALOG: ReportEntry[] = [
  { id: 'daily-summary',    name: 'Daily Trading Summary',        category: 'Operational', desc: 'Volume, P&L, and key metrics for the day' },
  { id: 'weekly-pnl',       name: 'Weekly P&L',                   category: 'Operational', desc: 'Revenue breakdown by source over 7 days' },
  { id: 'monthly-review',   name: 'Monthly Business Review',      category: 'Operational', desc: 'Full month executive summary' },
  { id: 'symbol-perf',      name: 'Symbol Performance',           category: 'Operational', desc: 'Volume, spread income, and P&L per instrument' },
  { id: 'client-statement', name: 'Client Statement',             category: 'Client',      desc: 'Individual client trading and financial statement' },
  { id: 'client-activity',  name: 'Client Activity Summary',      category: 'Client',      desc: 'Login frequency, trade count, deposit patterns' },
  { id: 'new-clients',      name: 'New Client Report',            category: 'Client',      desc: 'Registrations, KYC completion rates, first deposit' },
  { id: 'dormant-clients',  name: 'Dormant Clients',              category: 'Client',      desc: 'Clients inactive for 30, 60, 90+ days' },
  { id: 'top-clients',      name: 'Top Clients by Volume',        category: 'Client',      desc: 'Ranked list of highest-volume traders' },
  { id: 'revenue-stmt',     name: 'Revenue Statement',            category: 'Financial',   desc: 'Spread, commission, swap income breakdown' },
  { id: 'commission-rpt',   name: 'Commission Report',            category: 'Financial',   desc: 'IB commission earned and paid' },
  { id: 'deposit-wdl',      name: 'Deposit/Withdrawal Summary',   category: 'Financial',   desc: 'Net funding flows by method and period' },
  { id: 'kyc-summary',      name: 'KYC Status Summary',           category: 'Compliance',  desc: 'KYC verification rates and pending queue' },
  { id: 'aml-screening',    name: 'AML Screening Report',         category: 'Compliance',  desc: 'Risk scores and flagged accounts' },
  { id: 'trade-surv',       name: 'Trade Surveillance Summary',   category: 'Compliance',  desc: 'Alert history and resolution status' },
  { id: 'mifid-txn',        name: 'Transaction Report (MiFID)',   category: 'Regulatory',  desc: 'Regulatory-format transaction export' },
  { id: 'position-rpt',     name: 'Position Report',              category: 'Regulatory',  desc: 'End-of-day position snapshot' },
  { id: 'best-exec',        name: 'Best Execution Report',        category: 'Regulatory',  desc: 'MiFID II best execution compliance' },
];

const CAT_BADGE: Record<string, string> = {
  Operational: 'badge badge-accent',
  Client:      'badge badge-bull',
  Financial:   'badge badge-warn',
  Compliance:  'badge badge-bear',
  Regulatory:  'badge badge-purple',
};

const ALL_COLUMNS = ['Date','Client ID','Client Name','Country','Account Type','Instrument','Side','Lots','Open Price','Close Price','P&L','Status'];

const PREVIEW_ROWS = [
  { date: '2024-01-15', client: 'C1001', name: 'Alexander Mitchell', country: 'GB', type: 'VIP',  instrument: 'EUR/USD', side: 'BUY',  lots: 2.5, open: '1.08420', close: '1.08910', pnl: '+$1,225', status: 'Closed' },
  { date: '2024-01-15', client: 'C1005', name: 'Wei Zhang',          country: 'SG', type: 'VIP',  instrument: 'XAUUSD',  side: 'BUY',  lots: 0.5, open: '2018.40',  close: '2024.80',  pnl: '+$320',   status: 'Closed' },
  { date: '2024-01-15', client: 'C1009', name: 'Tariq Hassan',       country: 'AE', type: 'VIP',  instrument: 'USD/JPY', side: 'SELL', lots: 1.0, open: '148.220',  close: '147.950',  pnl: '+$182',   status: 'Closed' },
  { date: '2024-01-14', client: 'C1007', name: 'Priya Sharma',       country: 'GB', type: 'Pro',  instrument: 'GBP/USD', side: 'BUY',  lots: 1.5, open: '1.27050', close: '1.26890', pnl: '-$240',   status: 'Closed' },
  { date: '2024-01-14', client: 'C1011', name: 'David Thompson',     country: 'AU', type: 'Pro',  instrument: 'AUD/USD', side: 'SELL', lots: 2.0, open: '0.65820', close: '0.65710', pnl: '+$220',   status: 'Closed' },
];

const STEPS = ['Report Type', 'Date Range', 'Filters', 'Columns', 'Format', 'Delivery'];

type WizardState = {
  reportId: string;
  datePreset: string;
  dateFrom: string;
  dateTo: string;
  filterClient: string;
  filterSymbol: string;
  filterAccountType: string;
  selectedCols: Set<string>;
  format: 'CSV' | 'XLSX' | 'PDF';
  delivery: 'download' | 'email' | 'schedule';
};

function ReportCatalog({ onSelect }: { onSelect: (id: string) => void }) {
  const [catFilter, setCatFilter] = useState('All');
  const categories = ['All', ...Array.from(new Set(REPORT_CATALOG.map(r => r.category)))];
  const filtered = catFilter === 'All' ? REPORT_CATALOG : REPORT_CATALOG.filter(r => r.category === catFilter);

  return (
    <div className="space-y-4">
      <div className="chart-tabs">
        {categories.map(c => (
          <button key={c} className={`chart-tab ${catFilter === c ? 'active' : ''}`}
            onClick={() => setCatFilter(c)}>{c}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {filtered.map(r => (
          <button key={r.id}
            className="card text-left p-4 hover:border-[var(--accent)] transition-colors"
            onClick={() => onSelect(r.id)}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-[12px] font-semibold text-fg1">{r.name}</p>
              <span className={`shrink-0 ${CAT_BADGE[r.category]}`}>{r.category}</span>
            </div>
            <p className="text-[11px] text-fg3 leading-relaxed">{r.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReportWizard({ initialId, onBack }: { initialId: string; onBack: () => void }) {
  const [step, setStep] = useState(initialId ? 2 : 1);
  const [state, setState] = useState<WizardState>({
    reportId: initialId, datePreset: 'month',
    dateFrom: '2024-01-01', dateTo: '2024-01-15',
    filterClient: '', filterSymbol: '', filterAccountType: '',
    selectedCols: new Set(ALL_COLUMNS.slice(0, 8)),
    format: 'CSV', delivery: 'download',
  });
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const set = <K extends keyof WizardState>(k: K, v: WizardState[K]) =>
    setState(s => ({ ...s, [k]: v }));

  const selectedReport = REPORT_CATALOG.find(r => r.id === state.reportId);

  const toggleCol = (col: string) => {
    const next = new Set(state.selectedCols);
    if (next.has(col)) next.delete(col); else next.add(col);
    set('selectedCols', next);
  };

  const generate = () => {
    setGenerating(true);
    setTimeout(() => { setGenerating(false); setGenerated(true); }, 1800);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button className="btn-ghost btn btn-sm" onClick={onBack}>
          <ChevronLeft size={13} /> Report Catalog
        </button>
        <div className="h-4 w-px bg-[var(--border)]" />
        <p className="module-title">Report Builder</p>
        {selectedReport && <p className="text-[12px] text-fg2">— {selectedReport.name}</p>}
      </div>

      {/* Step indicator */}
      <div className="grid grid-cols-6 gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i + 1)}
            className={`rounded-md py-2 text-[10px] font-medium transition-colors ${
              step === i + 1 ? 'bg-[var(--bg-panel)] text-accent'
                : step > i + 1 ? 'text-bull'
                : 'text-fg3 hover:text-fg2'
            }`}>
            <div className="mb-0.5 text-[8px] opacity-60">Step {i + 1}</div>
            {s}
            {step > i + 1 && <span className="ml-1">✓</span>}
          </button>
        ))}
      </div>

      <div className="card p-6">
        {/* Step 1 — Report type */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-[12px] font-semibold text-fg1 mb-4">Select a report type</p>
            <div className="grid grid-cols-2 gap-2">
              {REPORT_CATALOG.map(r => (
                <button key={r.id}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    state.reportId === r.id
                      ? 'border-accent bg-accent/5'
                      : 'border-[var(--border)] hover:border-[var(--border-hi)]'
                  }`}
                  onClick={() => set('reportId', r.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-medium text-fg1">{r.name}</p>
                    <span className={`shrink-0 text-[9px] ${CAT_BADGE[r.category]}`}>{r.category}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-fg3">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Date range */}
        {step === 2 && (
          <div className="space-y-4 max-w-md">
            <p className="text-[12px] font-semibold text-fg1">Date Range</p>
            <div className="flex gap-2">
              {['Today', 'Week', 'Month', 'Quarter', 'Year'].map(p => (
                <button key={p}
                  className={`btn btn-sm ${state.datePreset === p.toLowerCase() ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => set('datePreset', p.toLowerCase())}>
                  {p}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="kpi-label mb-1 block">From</label>
                <input className="input" type="date" value={state.dateFrom}
                  onChange={e => set('dateFrom', e.target.value)} />
              </div>
              <div>
                <label className="kpi-label mb-1 block">To</label>
                <input className="input" type="date" value={state.dateTo}
                  onChange={e => set('dateTo', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Filters */}
        {step === 3 && (
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <p className="col-span-2 text-[12px] font-semibold text-fg1">Apply Filters (optional)</p>
            {[
              { label: 'Client ID / Name', key: 'filterClient', ph: 'e.g. C1001 or Alexander' },
              { label: 'Symbol',           key: 'filterSymbol', ph: 'e.g. EUR/USD' },
              { label: 'Account Type',     key: 'filterAccountType', ph: 'Standard / Pro / VIP' },
            ].map(f => (
              <div key={f.key}>
                <label className="kpi-label mb-1 block">{f.label}</label>
                <input className="input" placeholder={f.ph}
                  value={(state as Record<string, unknown>)[f.key] as string}
                  onChange={e => set(f.key as keyof WizardState, e.target.value as never)} />
              </div>
            ))}
          </div>
        )}

        {/* Step 4 — Columns */}
        {step === 4 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-fg1">Select Columns</p>
              <div className="flex gap-2">
                <button className="btn-ghost btn btn-xs"
                  onClick={() => set('selectedCols', new Set(ALL_COLUMNS))}>All</button>
                <button className="btn-ghost btn btn-xs"
                  onClick={() => set('selectedCols', new Set())}>None</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_COLUMNS.map(col => (
                <button key={col}
                  className={`rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    state.selectedCols.has(col)
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-[var(--border)] text-fg3 hover:text-fg2'
                  }`}
                  onClick={() => toggleCol(col)}>
                  {col}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5 — Format */}
        {step === 5 && (
          <div className="space-y-4 max-w-sm">
            <p className="text-[12px] font-semibold text-fg1">Output Format</p>
            <div className="space-y-2">
              {(['CSV', 'XLSX', 'PDF'] as const).map(fmt => (
                <label key={fmt} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                  state.format === fmt ? 'border-accent bg-accent/5' : 'border-[var(--border)]'
                }`}>
                  <input type="radio" className="accent-accent" checked={state.format === fmt}
                    onChange={() => set('format', fmt)} />
                  <div>
                    <p className="text-[12px] font-medium text-fg1">{fmt}</p>
                    <p className="text-[10px] text-fg3">
                      {fmt === 'CSV' ? 'Comma-separated, opens in Excel'
                        : fmt === 'XLSX' ? 'Native Excel with formatting'
                        : 'Formatted PDF for sharing'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 6 — Delivery / Generate */}
        {step === 6 && (
          <div className="space-y-5">
            <p className="text-[12px] font-semibold text-fg1">Delivery Method</p>
            <div className="space-y-2 max-w-sm">
              {(['download', 'email', 'schedule'] as const).map(d => (
                <label key={d} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                  state.delivery === d ? 'border-accent bg-accent/5' : 'border-[var(--border)]'
                }`}>
                  <input type="radio" className="accent-accent" checked={state.delivery === d}
                    onChange={() => set('delivery', d)} />
                  <p className="text-[12px] font-medium text-fg1 capitalize">{d}</p>
                </label>
              ))}
            </div>

            {/* Summary */}
            <div className="rounded-lg border border-[var(--border)] p-4 space-y-1.5 text-[11px] max-w-sm">
              <p className="font-semibold text-fg2 mb-2">Summary</p>
              <p><span className="text-fg3">Report:</span> <span className="text-fg1">{selectedReport?.name}</span></p>
              <p><span className="text-fg3">Period:</span> <span className="mono-cell text-fg1">{state.dateFrom} → {state.dateTo}</span></p>
              <p><span className="text-fg3">Columns:</span> <span className="text-fg1">{state.selectedCols.size} selected</span></p>
              <p><span className="text-fg3">Format:</span> <span className="text-fg1">{state.format}</span></p>
            </div>

            {generated ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-bull/30 bg-bull/5 px-4 py-3">
                  <span className="text-[12px] text-bull">Report generated successfully</span>
                </div>
                <button className="btn-primary btn btn-sm"><Download size={13} /> Download</button>
                <button className="btn-ghost btn btn-sm" onClick={() => setGenerated(false)}>
                  <RefreshCw size={12} /> New Report
                </button>
              </div>
            ) : (
              <button className="btn-primary btn btn-sm" onClick={generate} disabled={generating}>
                {generating ? (
                  <><RefreshCw size={13} className="animate-spin" /> Generating...</>
                ) : (
                  <><FileText size={13} /> Generate Report</>
                )}
              </button>
            )}

            {/* Data preview */}
            <div>
              <p className="kpi-label mb-2">Data Preview (5 rows)</p>
              <div className="card overflow-x-auto p-0">
                <table className="data-table" style={{ minWidth: 800 }}>
                  <thead>
                    <tr>
                      {['Date','Client','Country','Instrument','Side','Lots','Open','Close','P&L','Status']
                        .map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {PREVIEW_ROWS.map((row, i) => (
                      <tr key={i}>
                        <td className="mono-cell text-[10px] text-fg3">{row.date}</td>
                        <td>
                          <p className="text-[12px] text-fg1">{row.name}</p>
                          <p className="mono-cell text-[10px] text-fg3">{row.client}</p>
                        </td>
                        <td className="text-[11px] text-fg2">{row.country}</td>
                        <td className="mono-cell font-bold text-[12px]">{row.instrument}</td>
                        <td><span className={`badge ${row.side === 'BUY' ? 'badge-bull' : 'badge-bear'}`}>{row.side}</span></td>
                        <td className="mono-cell text-[12px]">{row.lots}</td>
                        <td className="mono-cell text-[11px] text-fg2">{row.open}</td>
                        <td className="mono-cell text-[11px] text-fg2">{row.close}</td>
                        <td className={`mono-cell font-bold text-[12px] ${row.pnl.startsWith('+') ? 'text-bull' : 'text-bear'}`}>
                          {row.pnl}
                        </td>
                        <td><span className="badge badge-muted">{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div className="mt-6 flex justify-between">
          <button className="btn-ghost btn btn-sm" onClick={() => step > 1 ? setStep(s => s - 1) : onBack()}>
            <ChevronLeft size={13} /> Back
          </button>
          {step < 6 && (
            <button className="btn-primary btn btn-sm" onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !state.reportId}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReportBuilderPage() {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  if (builderOpen) {
    return (
      <div className="flex flex-col">
        <div className="p-6">
          <ReportWizard initialId={selectedId} onBack={() => { setBuilderOpen(false); setSelectedId(''); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Report Builder</p>
          <p className="module-subtitle">{REPORT_CATALOG.length} reports · operational, client, financial, compliance, regulatory</p>
        </div>
        <button className="btn-primary btn btn-sm" onClick={() => { setSelectedId(''); setBuilderOpen(true); }}>
          <FileText size={13} /> Custom Report
        </button>
      </div>
      <div className="p-6">
        <ReportCatalog onSelect={id => { setSelectedId(id); setBuilderOpen(true); }} />
      </div>
    </div>
  );
}
