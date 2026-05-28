/**
 * File:        apps/broker-admin/src/app/(admin)/exposure-limits/page.tsx
 * Module:      broker-admin · Risk · Exposure Limits
 * Purpose:     Per-symbol exposure limit management with utilization gauges and breach alerts
 *
 * Exports:
 *   - default (ExposureLimitsPage) — exposure table with edit modal and utilization bars
 *
 * Depends on:
 *   - @/lib/api/hooks/use-exposure-limits — live exposure limits via API
 *
 * Side-effects:
 *   - PATCH /admin/exposure-limits/:id on save (via updateLimit hook)
 *
 * Key invariants:
 *   - Utilization % = currentNetExposure / maxNetExposure * 100
 *   - Color coding: Normal=bull, Warning=warn, Breach=bear
 *   - Alert threshold and hard limit expressed as % of maxNetExposure
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-18
 */

'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, AlertCircle, Edit2, X } from 'lucide-react';
import { useExposureLimits } from '@/lib/api/hooks/use-exposure-limits';
import type { ExposureLimit } from '@/lib/types';

const STATUS_COLOR: Record<ExposureLimit['status'], string> = {
  Normal:  'bg-bull',
  Warning: 'bg-warn',
  Breach:  'bg-bear',
};

const STATUS_TEXT: Record<ExposureLimit['status'], string> = {
  Normal:  'text-bull',
  Warning: 'text-warn',
  Breach:  'text-bear',
};

const STATUS_BAR: Record<ExposureLimit['status'], string> = {
  Normal:  'bg-bull/70',
  Warning: 'bg-warn/70',
  Breach:  'bg-bear/70',
};

function UtilBar({ pct, status }: { pct: number; status: ExposureLimit['status'] }) {
  const capped = Math.min(pct, 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-[var(--bg-elevated)]">
        <div
          className={`h-full rounded-full transition-all ${STATUS_BAR[status]}`}
          style={{ width: `${capped}%` }}
        />
      </div>
      <span className={`mono-cell text-[11px] font-semibold ${STATUS_TEXT[status]}`}>{pct.toFixed(1)}%</span>
    </div>
  );
}

function EditLimitModal({ limit, onClose, onSave, saving }: {
  limit: ExposureLimit;
  onClose: () => void;
  onSave: (updated: ExposureLimit) => void;
  saving?: boolean;
}) {
  const [data, setData] = useState({ ...limit });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[400px] rounded-r-lg border border-[var(--border)] bg-[var(--bg-panel)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="module-title">Edit Limit</p>
            <p className="mono-cell text-[11px] text-fg3">{limit.symbol}</p>
          </div>
          <button onClick={onClose} className="btn-ghost btn btn-xs p-1.5"><X size={14} /></button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {([
            ['Max Net Exposure ($)', 'maxNetExposure'],
            ['Alert Threshold (%)',  'alertThreshold'],
            ['Hard Limit (%)',       'hardLimit'],
          ] as [string, keyof ExposureLimit][]).map(([label, field]) => (
            <div key={field}>
              <label className="kpi-label mb-1 block">{label}</label>
              <input
                className="input"
                type="number"
                value={data[field] as number}
                onChange={e => setData(d => ({ ...d, [field]: +e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button className="btn-ghost btn btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn btn-sm" onClick={() => { onSave(data); }} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

export default function ExposureLimitsPage() {
  const { limits, isLoading, refetch, updateLimit } = useExposureLimits();
  const [editing, setEditing] = useState<ExposureLimit | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const breached = useMemo(() => limits.filter(l => l.status === 'Breach'), [limits]);
  const warned   = useMemo(() => limits.filter(l => l.status === 'Warning'), [limits]);

  const handleSave = async (updated: ExposureLimit) => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateLimit(updated.id, {
        maxNetExposure: updated.maxNetExposure,
        alertThreshold: updated.alertThreshold,
        hardLimit: updated.hardLimit,
      });
      setEditing(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save limit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Exposure Limits</p>
          <p className="module-subtitle">
            {limits.length} symbols ·{' '}
            {breached.length > 0 && <span className="text-bear">{breached.length} breach{breached.length !== 1 ? 'es' : ''} · </span>}
            {warned.length > 0 && <span className="text-warn">{warned.length} warning{warned.length !== 1 ? 's' : ''}</span>}
            {breached.length === 0 && warned.length === 0 && <span className="text-bull">All Normal</span>}
          </p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Alert banners */}
        {breached.length > 0 && (
          <div className="flex items-start gap-3 rounded-r-lg border border-bear/30 bg-bear/10 px-4 py-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-bear" />
            <div>
              <p className="text-[12px] font-semibold text-bear">Hard Limit Breached</p>
              <p className="text-[11px] text-bear/80">{breached.map(b => b.symbol).join(', ')} — immediate dealer review required</p>
            </div>
          </div>
        )}
        {warned.length > 0 && (
          <div className="flex items-start gap-3 rounded-r-lg border border-warn/30 bg-warn/10 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
            <div>
              <p className="text-[12px] font-semibold text-warn">Alert Threshold Reached</p>
              <p className="text-[11px] text-warn/80">{warned.map(w => w.symbol).join(', ')} — approaching hard limit</p>
            </div>
          </div>
        )}

        {/* Utilization gauge grid */}
        <div className="grid grid-cols-3 gap-3">
          {limits.map(l => (
            <div key={l.id} className="kpi-card">
              <div className="flex items-center justify-between">
                <p className="kpi-label">{l.symbol}</p>
                <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[l.status]}`} />
              </div>
              <UtilBar pct={l.utilizationPct} status={l.status} />
              <div className="kpi-bottom">
                <div className="kpi-sub">
                  ${l.currentNetExposure.toLocaleString()} / ${l.maxNetExposure.toLocaleString()}
                </div>
                <button className="btn-ghost btn btn-xs" onClick={() => setEditing(l)}>
                  <Edit2 size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Detail table */}
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Current Exposure</th>
                <th>Max Exposure</th>
                <th>Utilization</th>
                <th>Alert Threshold</th>
                <th>Hard Limit</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {limits.map(l => (
                <tr key={l.id}>
                  <td className="mono-cell font-bold text-[13px]">{l.symbol}</td>
                  <td className={`mono-cell font-bold text-[12px] ${STATUS_TEXT[l.status]}`}>
                    ${l.currentNetExposure.toLocaleString()}
                  </td>
                  <td className="mono-cell text-[12px] text-fg2">${l.maxNetExposure.toLocaleString()}</td>
                  <td><UtilBar pct={l.utilizationPct} status={l.status} /></td>
                  <td className="mono-cell text-[11px] text-warn">{l.alertThreshold}%</td>
                  <td className="mono-cell text-[11px] text-bear">{l.hardLimit}%</td>
                  <td>
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[l.status]}`} />
                      <span className={STATUS_TEXT[l.status]}>{l.status}</span>
                    </span>
                  </td>
                  <td>
                    <button className="btn-ghost btn btn-xs" onClick={() => setEditing(l)}>
                      <Edit2 size={11} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditLimitModal
          limit={editing}
          onClose={() => { setEditing(null); setSaveError(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}
      {saveError && (
        <div className="mx-6 rounded border border-bear/40 bg-bear/5 px-4 py-2">
          <p className="text-[11px] text-bear">{saveError}</p>
        </div>
      )}
    </div>
  );
}
