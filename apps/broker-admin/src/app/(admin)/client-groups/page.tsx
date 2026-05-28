/**
 * File:        apps/broker-admin/src/app/(admin)/client-groups/page.tsx
 * Module:      broker-admin · Clients · Client Groups
 * Purpose:     Client group (account type) management with leverage, commission, and bonus settings
 *
 * Exports:
 *   - default (ClientGroupsPage) — groups grid + edit modal
 *
 * Depends on:
 *   - @/lib/api/hooks/use-client-groups — useClientGroups()
 *   - @/lib/types — ClientGroup
 *
 * Side-effects:
 *   - Local state copy; group edits persist within session only
 *
 * Key invariants:
 *   - group.color is a hex string used for the left accent border on cards
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-18
 */

'use client';

import { useState } from 'react';
import { Edit2, X, Plus } from 'lucide-react';
import { useClientGroups } from '@/lib/api/hooks/use-client-groups';
import type { ClientGroup } from '@/lib/types';

function EditGroupModal({ group, onClose, onSave }: {
  group: ClientGroup;
  onClose: () => void;
  onSave: (g: ClientGroup) => void;
}) {
  const [data, setData] = useState({ ...group });
  const set = <K extends keyof ClientGroup>(k: K, v: ClientGroup[K]) => setData(d => ({ ...d, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[440px] rounded-r-lg border border-[var(--border)] bg-[var(--bg-panel)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <p className="module-title">Edit Group: {group.name}</p>
          <button onClick={onClose} className="btn-ghost btn btn-xs p-1.5"><X size={14} /></button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="kpi-label mb-1 block">Group Name</label>
            <input className="input" value={data.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="kpi-label mb-1 block">Description</label>
            <input className="input" value={data.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="kpi-label mb-1 block">Default Leverage</label>
              <select className="input" value={data.leverage} onChange={e => set('leverage', e.target.value)}>
                {['1:10', '1:20', '1:30', '1:50', '1:100', '1:200', '1:500'].map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="kpi-label mb-1 block">Commission Type</label>
              <select className="input" value={data.commissionType} onChange={e => set('commissionType', e.target.value as ClientGroup['commissionType'])}>
                <option>Spread</option><option>Per Lot</option><option>Mixed</option>
              </select>
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-fg2">
              <input type="checkbox" checked={data.swapFree} onChange={e => set('swapFree', e.target.checked)} className="accent-accent" />
              Swap-free (Islamic)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-fg2">
              <input type="checkbox" checked={data.bonusEligible} onChange={e => set('bonusEligible', e.target.checked)} className="accent-accent" />
              Bonus eligible
            </label>
          </div>
          <div>
            <label className="kpi-label mb-1 block">Accent Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={data.color} onChange={e => set('color', e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-[var(--border)] bg-transparent" />
              <span className="mono-cell text-[11px] text-fg3">{data.color}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button className="btn-ghost btn btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn btn-sm" onClick={() => { onSave(data); onClose(); }}>Save Group</button>
        </div>
      </div>
    </div>
  );
}

function ClientGroupsGrid({ groups, totalClients }: { groups: ClientGroup[]; totalClients: number }) {
  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {groups.map(g => (
          <div key={g.id} className="card overflow-hidden" style={{ borderLeft: `3px solid ${g.color}` }}>
            <div className="card-header">
              <div>
                <p className="card-title" style={{ color: g.color }}>{g.name}</p>
                <p className="mt-0.5 text-[11px] text-fg3">{g.description}</p>
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <p className="kpi-label">Clients</p>
                  <p className="mono-cell text-[18px] font-bold text-fg1">{g.clientCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="kpi-label">Leverage</p>
                  <p className="mono-cell text-[18px] font-bold text-fg1">{g.leverage}</p>
                </div>
                <div>
                  <p className="kpi-label">Commission</p>
                  <p className="mono-cell text-[14px] font-semibold text-fg2">{g.commissionType}</p>
                </div>
              </div>
              <div className="flex gap-3">
                {g.swapFree && <span className="badge badge-accent">Swap-Free</span>}
                {g.bonusEligible && <span className="badge badge-gold">Bonus Eligible</span>}
                {!g.swapFree && !g.bonusEligible && <span className="badge badge-muted">Standard</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <div className="card-header">
          <p className="card-title">Group Comparison</p>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Group</th>
              <th>Clients</th>
              <th>Share %</th>
              <th>Leverage</th>
              <th>Commission</th>
              <th>Swap-Free</th>
              <th>Bonuses</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: g.color }} />
                    <span className="text-[12px] font-medium text-fg1">{g.name}</span>
                  </div>
                </td>
                <td className="mono-cell text-[12px]">{g.clientCount.toLocaleString()}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 rounded-full bg-[var(--bg-elevated)]">
                      <div className="h-full rounded-full" style={{ width: `${(g.clientCount / totalClients) * 100}%`, backgroundColor: g.color }} />
                    </div>
                    <span className="mono-cell text-[10px] text-fg3">{((g.clientCount / totalClients) * 100).toFixed(1)}%</span>
                  </div>
                </td>
                <td className="mono-cell text-[11px] text-fg2">{g.leverage}</td>
                <td className="text-[11px] text-fg2">{g.commissionType}</td>
                <td>{g.swapFree ? <span className="badge badge-accent">Yes</span> : <span className="text-[11px] text-fg3">No</span>}</td>
                <td>{g.bonusEligible ? <span className="badge badge-gold">Yes</span> : <span className="text-[11px] text-fg3">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupCardRow({ group, onEdit }: { group: ClientGroup; onEdit: () => void }) {
  return (
    <div className="card overflow-hidden" style={{ borderLeft: `3px solid ${group.color}` }}>
      <div className="card-header">
        <div>
          <p className="card-title" style={{ color: group.color }}>{group.name}</p>
          <p className="mt-0.5 text-[11px] text-fg3">{group.description}</p>
        </div>
        <button className="btn-ghost btn btn-xs" onClick={onEdit}>
          <Edit2 size={11} /> Edit
        </button>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <p className="kpi-label">Clients</p>
            <p className="mono-cell text-[18px] font-bold text-fg1">{group.clientCount.toLocaleString()}</p>
          </div>
          <div>
            <p className="kpi-label">Leverage</p>
            <p className="mono-cell text-[18px] font-bold text-fg1">{group.leverage}</p>
          </div>
          <div>
            <p className="kpi-label">Commission</p>
            <p className="mono-cell text-[14px] font-semibold text-fg2">{group.commissionType}</p>
          </div>
        </div>
        <div className="flex gap-3">
          {group.swapFree && <span className="badge badge-accent">Swap-Free</span>}
          {group.bonusEligible && <span className="badge badge-gold">Bonus Eligible</span>}
          {!group.swapFree && !group.bonusEligible && <span className="badge badge-muted">Standard</span>}
        </div>
      </div>
    </div>
  );
}

export default function ClientGroupsPage() {
  const { groups, isLoading } = useClientGroups();
  const [localGroups, setLocalGroups] = useState<ClientGroup[]>([]);
  const [editing, setEditing] = useState<ClientGroup | null>(null);

  // Merge API groups with any local edits (edits win)
  const mergedGroups: ClientGroup[] = groups.length > 0
    ? groups.map(g => localGroups.find(l => l.id === g.id) ?? g)
    : localGroups;

  const saveGroup = (updated: ClientGroup) => {
    setLocalGroups(prev => {
      const existing = prev.find(g => g.id === updated.id);
      if (existing) return prev.map(g => g.id === updated.id ? updated : g);
      return [...prev, updated];
    });
  };

  const totalClients = mergedGroups.reduce((s, g) => s + g.clientCount, 0);

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Client Groups</p>
          <p className="module-subtitle">
            {isLoading ? 'Loading…' : `${mergedGroups.length} groups · ${totalClients.toLocaleString()} clients total`}
          </p>
        </div>
        <button className="btn-primary btn btn-sm"><Plus size={13} /> New Group</button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-fg3">
          <span className="font-ui text-[12px]">Loading client groups…</span>
        </div>
      ) : mergedGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
          <p className="font-ui text-[12px] text-fg2">No client groups found</p>
        </div>
      ) : (
        <ClientGroupsGrid groups={mergedGroups} totalClients={totalClients} />
      )}

      {editing && (
        <EditGroupModal group={editing} onClose={() => setEditing(null)} onSave={saveGroup} />
      )}
    </div>
  );
}