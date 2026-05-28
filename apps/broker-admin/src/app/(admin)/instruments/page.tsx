/**
 * File:        apps/broker-admin/src/app/(admin)/instruments/page.tsx
 * Module:      broker-admin · Trading · Instruments
 * Purpose:     Instrument management table with inline editing and full-edit modal
 *
 * Exports:
 *   - default (InstrumentsPage) — instruments table, inline spread/lot edits, enable/disable
 *
 * Depends on:
 *   - @/lib/mock-data-context — useBrokerData() for instruments list
 *   - @/lib/types             — Instrument, AssetClass
 *
 * Side-effects:
 *   - Local useState copy of instruments (mutations don't persist to context)
 *
 * Key invariants:
 *   - Inline edits are staged in `unsaved` record and batch-saved; Escape discards
 *   - Modal uses local copy of instrument data; saved back on confirm
 *   - assetClass used as category filter (not prototype's "category" field)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { Settings, Save, RotateCcw, Plus } from 'lucide-react';
import { useBrokerData } from '@/lib/mock-data-context';
import type { Instrument, AssetClass } from '@/lib/types';

const ASSET_CLASSES: (AssetClass | 'All')[] = ['All', 'Forex', 'Crypto', 'Indices', 'Commodities', 'Stocks', 'ETF'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MODAL_TABS = ['General', 'Pricing', 'Leverage', 'Sessions', 'Swaps'] as const;

type UnsavedKey = `${string}.${keyof Instrument}`;

function StatusDot({ status }: { status: Instrument['status'] }) {
  const color = status === 'Active' ? 'bg-bull' : status === 'Halted' ? 'bg-warn' : 'bg-[var(--fg3)]';
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}

function EditModal({ instrument, onClose, onSave }: {
  instrument: Instrument;
  onClose: () => void;
  onSave: (updated: Instrument) => void;
}) {
  const [tab, setTab] = useState<typeof MODAL_TABS[number]>('General');
  const [data, setData] = useState<Instrument>({ ...instrument });
  const set = <K extends keyof Instrument>(k: K, v: Instrument[K]) => setData(d => ({ ...d, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="flex w-[580px] flex-col rounded-r-lg border border-[var(--border)] bg-[var(--bg-panel)] shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="font-mono text-[15px] font-bold text-fg1">{data.symbol}</p>
            <p className="text-[11px] text-fg3">{data.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => set('status', data.status === 'Active' ? 'Disabled' : 'Active')}
                className={`relative h-5 w-9 rounded-full transition-colors ${data.status === 'Active' ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${data.status === 'Active' ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-[11px] text-fg3">{data.status}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="chart-tabs m-4 mb-0">
          {MODAL_TABS.map(t => (
            <button key={t} className={`chart-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {/* Content */}
        <div className="max-h-[420px] overflow-y-auto px-5 py-4">
          {tab === 'General' && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[['Symbol', 'symbol', 'text'] as const, ['Name', 'name', 'text'] as const].map(([l, f, t]) => (
                <div key={f}>
                  <label className="kpi-label mb-1 block">{l}</label>
                  <input className="input" type={t} value={data[f] as string}
                    onChange={e => set(f, e.target.value as never)} />
                </div>
              ))}
              <div>
                <label className="kpi-label mb-1 block">Asset Class</label>
                <select className="input" value={data.assetClass}
                  onChange={e => set('assetClass', e.target.value as AssetClass)}>
                  {ASSET_CLASSES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="kpi-label mb-1 block">Digits</label>
                <input className="input" type="number" value={data.digits} onChange={e => set('digits', +e.target.value)} />
              </div>
              {[['Min Lot', 'minLot'], ['Max Lot', 'maxLot'], ['Lot Step', 'lotStep'], ['Contract Size', 'contractSize']].map(([l, f]) => (
                <div key={f}>
                  <label className="kpi-label mb-1 block">{l}</label>
                  <input className="input" type="number" value={data[f as keyof Instrument] as number}
                    onChange={e => set(f as keyof Instrument, +e.target.value as never)} />
                </div>
              ))}
            </div>
          )}

          {tab === 'Pricing' && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <label className="kpi-label mb-1 block">Spread Type</label>
                <select className="input" value={data.spreadType}
                  onChange={e => set('spreadType', e.target.value as 'Fixed' | 'Variable')}>
                  <option>Fixed</option><option>Variable</option>
                </select>
              </div>
              <div>
                <label className="kpi-label mb-1 block">Spread (pips)</label>
                <input className="input" type="number" value={data.spread} onChange={e => set('spread', +e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="kpi-label mb-1 block">Commission Markup (pips)</label>
                <input className="input" type="number" defaultValue={0.2} />
              </div>
              {[['Slippage Model', ['None', 'Market', 'Up to 2 pips', 'Up to 5 pips']],
                ['Commission Type', ['None', 'Per lot', 'Per trade', '% Notional']]].map(([l, opts]) => (
                <div key={l as string}>
                  <label className="kpi-label mb-1 block">{l as string}</label>
                  <select className="input">
                    {(opts as string[]).map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          {tab === 'Leverage' && (
            <div>
              <p className="kpi-label mb-3">Per-Group Leverage Overrides</p>
              {[['Retail', '1:100'], ['Professional', '1:200'], ['VIP', '1:500']].map(([group, def]) => (
                <div key={group} className="flex items-center gap-4 border-b border-[var(--border)] py-2.5">
                  <span className="w-28 text-[12px] font-medium text-fg2">{group}</span>
                  <select className="input w-28" defaultValue={def}>
                    {[2, 5, 10, 20, 30, 50, 100, 200, 500].map(l => <option key={l}>1:{l}</option>)}
                  </select>
                  <span className="text-[11px] text-fg3">Max leverage</span>
                </div>
              ))}
              <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3">
                {[['Initial Margin %', '1'], ['Maintenance %', '0.5'], ['Stop-Out %', '20']].map(([l, def]) => (
                  <div key={l}>
                    <label className="kpi-label mb-1 block">{l}</label>
                    <input className="input" type="number" defaultValue={def} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'Sessions' && (
            <div>
              <p className="kpi-label mb-3">Weekly Trading Schedule (UTC)</p>
              {DAYS.map(day => (
                <div key={day} className="flex items-center gap-3 border-b border-[var(--border)] py-2">
                  <span className="w-8 text-[12px] text-fg2">{day}</span>
                  {['Sat', 'Sun'].includes(day) ? (
                    <span className="flex items-center gap-2 text-[11px] text-fg3">
                      <input type="checkbox" defaultChecked={false} className="accent-accent" /> Closed
                    </span>
                  ) : (
                    <>
                      <input className="input w-24" type="time" defaultValue="00:00" />
                      <span className="text-[11px] text-fg3">to</span>
                      <input className="input w-24" type="time" defaultValue="23:59" />
                      <button className="btn-ghost btn btn-xs">+ Break</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'Swaps' && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <label className="kpi-label mb-1 block">Swap Long (per lot/night)</label>
                <input className="input" type="number" value={data.swapLong} onChange={e => set('swapLong', +e.target.value)} />
              </div>
              <div>
                <label className="kpi-label mb-1 block">Swap Short (per lot/night)</label>
                <input className="input" type="number" value={data.swapShort} onChange={e => set('swapShort', +e.target.value)} />
              </div>
              <div>
                <label className="kpi-label mb-1 block">Triple Swap Day</label>
                <select className="input"><option>Wednesday</option><option>Friday</option></select>
              </div>
              <div>
                <label className="kpi-label mb-1 block">Swap Type</label>
                <select className="input"><option>Pips</option><option>Percentage</option><option>Flat fee</option></select>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-3 rounded-r-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                  <button className="relative h-5 w-9 rounded-full bg-[var(--border-md)]">
                    <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow" />
                  </button>
                  <div>
                    <p className="text-[12px] font-medium text-fg1">Swap-free (Islamic accounts)</p>
                    <p className="text-[10px] text-fg3">Enable for clients with Islamic account type</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button className="btn-ghost btn btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn btn-sm" onClick={() => { onSave(data); onClose(); }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

export default function InstrumentsPage() {
  const { instruments: initialInstruments } = useBrokerData();
  const [instruments, setInstruments] = useState<Instrument[]>([...initialInstruments]);
  const [filter, setFilter] = useState<AssetClass | 'All'>('All');
  const [unsaved, setUnsaved] = useState<Partial<Record<UnsavedKey, number>>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [modal, setModal] = useState<Instrument | null>(null);

  const displayed = useMemo(
    () => filter === 'All' ? instruments : instruments.filter(i => i.assetClass === filter),
    [instruments, filter]
  );

  const getVal = (inst: Instrument, field: keyof Instrument): number => {
    const key = `${inst.symbol}.${field}` as UnsavedKey;
    return (key in unsaved ? unsaved[key] : inst[field]) as number;
  };

  const stageEdit = (symbol: string, field: keyof Instrument, value: number) => {
    setUnsaved(u => ({ ...u, [`${symbol}.${field}`]: value }));
  };

  const saveAll = () => {
    setInstruments(prev => prev.map(inst => {
      const updates: Partial<Instrument> = {};
      (Object.keys(unsaved) as UnsavedKey[]).forEach(k => {
        const [sym, field] = k.split('.') as [string, keyof Instrument];
        if (sym === inst.symbol) (updates as Record<string, unknown>)[field] = unsaved[k];
      });
      return Object.keys(updates).length ? { ...inst, ...updates } : inst;
    }));
    setUnsaved({});
  };

  const toggleStatus = useCallback((symbol: string) => {
    setInstruments(prev => prev.map(i =>
      i.symbol === symbol ? { ...i, status: i.status === 'Active' ? 'Disabled' : 'Active' } : i
    ));
  }, []);

  const unsavedCount = Object.keys(unsaved).length;

  const InlineCell = ({ inst, field }: { inst: Instrument; field: keyof Instrument }) => {
    const key = `${inst.symbol}.${field}`;
    const isEditing = editing === key;
    const val = getVal(inst, field);
    const isDirty = key in unsaved;

    if (isEditing) {
      return (
        <input
          className="input input-sm w-16"
          type="number"
          defaultValue={val}
          autoFocus
          onBlur={e => { stageEdit(inst.symbol, field, +e.target.value); setEditing(null); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }}
        />
      );
    }
    return (
      <span
        onClick={() => setEditing(key)}
        className={`mono-cell cursor-text rounded px-1 py-0.5 text-[11px] transition-colors ${isDirty ? 'border border-warn/40 bg-warn/10 text-warn' : 'border border-transparent hover:border-[var(--border-md)]'}`}
        title="Click to edit"
      >
        {val}
      </span>
    );
  };

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Instruments</p>
          <p className="module-subtitle">
            {instruments.filter(i => i.status === 'Active').length} active · {instruments.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unsavedCount > 0 && (
            <>
              <span className="flex items-center gap-1.5 text-[11px] text-warn">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                {unsavedCount} unsaved
              </span>
              <button className="btn-ghost btn btn-sm" onClick={() => setUnsaved({})}>
                <RotateCcw size={12} /> Discard
              </button>
              <button className="btn-ghost btn btn-sm text-warn" onClick={saveAll}>
                <Save size={12} /> Save All
              </button>
            </>
          )}
          <button className="btn-ghost btn btn-sm">Import</button>
          <button className="btn-primary btn btn-sm"><Plus size={13} /> Add Instrument</button>
        </div>
      </div>

      <div className="p-6">
        {/* Asset class filter */}
        <div className="chart-tabs mb-4">
          {ASSET_CLASSES.map(cls => {
            const cnt = cls === 'All' ? instruments.length : instruments.filter(i => i.assetClass === cls).length;
            return (
              <button key={cls} className={`chart-tab ${filter === cls ? 'active' : ''}`} onClick={() => setFilter(cls)}>
                {cls} <span className="ml-1 font-mono text-[9px] text-fg3">{cnt}</span>
              </button>
            );
          })}
        </div>

        <div className="card overflow-x-auto">
          <table className="data-table" style={{ minWidth: 960 }}>
            <thead>
              <tr>
                <th className="w-12">On</th>
                <th className="w-20">Symbol</th>
                <th>Name</th>
                <th className="w-20">Class</th>
                <th className="w-20">Spread Type</th>
                <th className="w-16">Spread</th>
                <th className="w-16">Min Lot</th>
                <th className="w-16">Max Lot</th>
                <th className="w-20">Leverage</th>
                <th className="w-16">Swap L</th>
                <th className="w-16">Swap S</th>
                <th className="w-20">Vol Today</th>
                <th className="w-16">Status</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(inst => (
                <tr key={inst.symbol}>
                  <td>
                    <button
                      onClick={() => toggleStatus(inst.symbol)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${inst.status === 'Active' ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${inst.status === 'Active' ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className={`mono-cell font-bold text-[12px] ${inst.status === 'Active' ? 'text-fg1' : 'text-fg3'}`}>
                    {inst.symbol}
                  </td>
                  <td className="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-fg2">
                    {inst.name}
                  </td>
                  <td><span className="badge badge-muted">{inst.assetClass}</span></td>
                  <td className="text-[11px] text-fg2">{inst.spreadType}</td>
                  <td><InlineCell inst={inst} field="spread" /></td>
                  <td><InlineCell inst={inst} field="minLot" /></td>
                  <td><InlineCell inst={inst} field="maxLot" /></td>
                  <td className="mono-cell text-[11px] text-fg2">{inst.leverage}</td>
                  <td className={`mono-cell text-[11px] ${inst.swapLong < 0 ? 'text-bear' : 'text-bull'}`}>
                    {inst.swapLong > 0 ? '+' : ''}{inst.swapLong}
                  </td>
                  <td className={`mono-cell text-[11px] ${inst.swapShort < 0 ? 'text-bear' : 'text-bull'}`}>
                    {inst.swapShort > 0 ? '+' : ''}{inst.swapShort}
                  </td>
                  <td className="mono-cell text-[11px] text-fg2">{inst.volumeToday.toLocaleString()}</td>
                  <td>
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <StatusDot status={inst.status} />
                      {inst.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn-ghost btn btn-xs p-1" onClick={() => setModal(inst)}>
                      <Settings size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <EditModal
          instrument={modal}
          onClose={() => setModal(null)}
          onSave={updated => setInstruments(prev => prev.map(i => i.symbol === updated.symbol ? updated : i))}
        />
      )}
    </div>
  );
}
