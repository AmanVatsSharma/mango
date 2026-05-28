/**
 * File:        apps/broker-admin/src/app/(admin)/roles-permissions/page.tsx
 * Module:      broker-admin · Team · Roles & Permissions
 * Purpose:     Role definition, permission matrix management, and role assignment overview
 *
 * Exports:
 *   - default (RolesPermissionsPage) — two tabs: Permission Matrix | Roles
 *
 * Depends on:
 *   - none (all data is local state)
 *
 * Side-effects:
 *   - Local state only; permission toggles do not persist
 *
 * Key invariants:
 *   - Super Admin always has all permissions — cannot be modified
 *   - Permission changes on system roles require confirmation (guarded by isSystem flag)
 *   - Each permission belongs to a category for grouping in the matrix
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Shield, Check, X } from 'lucide-react';

type Role = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  isSystem: boolean;
  color: string;
  permissions: Set<string>;
};

type Permission = {
  id: string;
  label: string;
  category: string;
};

const PERMISSION_GROUPS: { category: string; permissions: Permission[] }[] = [
  {
    category: 'Clients',
    permissions: [
      { id: 'clients.view',    label: 'View Clients',    category: 'Clients' },
      { id: 'clients.edit',    label: 'Edit Clients',    category: 'Clients' },
      { id: 'clients.block',   label: 'Block/Unblock',   category: 'Clients' },
      { id: 'kyc.approve',     label: 'Approve KYC',     category: 'Clients' },
    ],
  },
  {
    category: 'Trading',
    permissions: [
      { id: 'orders.view',     label: 'View Orders',     category: 'Trading' },
      { id: 'orders.cancel',   label: 'Cancel Orders',   category: 'Trading' },
      { id: 'dealing.approve', label: 'Dealer Actions',  category: 'Trading' },
      { id: 'pricing.edit',    label: 'Edit Pricing',    category: 'Trading' },
    ],
  },
  {
    category: 'Finance',
    permissions: [
      { id: 'tx.view',         label: 'View Transactions',  category: 'Finance' },
      { id: 'tx.approve',      label: 'Approve Withdrawals',category: 'Finance' },
      { id: 'bonus.manage',    label: 'Manage Bonuses',     category: 'Finance' },
      { id: 'pnl.view',        label: 'View P&L',           category: 'Finance' },
    ],
  },
  {
    category: 'Risk',
    permissions: [
      { id: 'risk.view',       label: 'View Risk Dashboard', category: 'Risk' },
      { id: 'risk.config',     label: 'Configure Limits',    category: 'Risk' },
      { id: 'aml.view',        label: 'View AML Cases',      category: 'Risk' },
      { id: 'aml.action',      label: 'Take AML Action',     category: 'Risk' },
    ],
  },
  {
    category: 'Platform',
    permissions: [
      { id: 'settings.view',   label: 'View Settings',    category: 'Platform' },
      { id: 'settings.edit',   label: 'Edit Settings',    category: 'Platform' },
      { id: 'team.manage',     label: 'Manage Team',      category: 'Platform' },
      { id: 'reports.export',  label: 'Export Reports',   category: 'Platform' },
    ],
  },
];

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.permissions);

const INIT_ROLES: Role[] = [
  {
    id: 'R001', name: 'Super Admin', description: 'Full unrestricted access to all platform features', memberCount: 2, isSystem: true, color: 'text-bear',
    permissions: new Set(ALL_PERMISSIONS.map(p => p.id)),
  },
  {
    id: 'R002', name: 'Compliance Officer', description: 'KYC, AML, surveillance, and regulatory reporting access', memberCount: 3, isSystem: true, color: 'text-warn',
    permissions: new Set(['clients.view', 'kyc.approve', 'orders.view', 'aml.view', 'aml.action', 'risk.view', 'reports.export', 'tx.view']),
  },
  {
    id: 'R003', name: 'Dealer', description: 'Order management, dealer desk interventions, and pricing', memberCount: 5, isSystem: true, color: 'text-accent',
    permissions: new Set(['clients.view', 'orders.view', 'orders.cancel', 'dealing.approve', 'pricing.edit', 'risk.view']),
  },
  {
    id: 'R004', name: 'Finance Manager', description: 'Transaction approval, bonus management, and P&L reporting', memberCount: 4, isSystem: false, color: 'text-bull',
    permissions: new Set(['clients.view', 'tx.view', 'tx.approve', 'bonus.manage', 'pnl.view', 'reports.export']),
  },
  {
    id: 'R005', name: 'Support Agent', description: 'Read-only client access for customer support queries', memberCount: 8, isSystem: false, color: 'text-fg2',
    permissions: new Set(['clients.view', 'orders.view', 'tx.view']),
  },
  {
    id: 'R006', name: 'IB Manager', description: 'IB network, commission configuration, and client onboarding', memberCount: 2, isSystem: false, color: 'text-purple',
    permissions: new Set(['clients.view', 'clients.edit', 'tx.view', 'bonus.manage', 'reports.export']),
  },
];

export default function RolesPermissionsPage() {
  const [tab, setTab] = useState<'matrix' | 'roles'>('matrix');
  const [roles, setRoles] = useState<Role[]>(INIT_ROLES);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const togglePerm = (roleId: string, permId: string) => {
    setRoles(rs => rs.map(r => {
      if (r.id !== roleId || r.isSystem) return r;
      const next = new Set(r.permissions);
      if (next.has(permId)) next.delete(permId); else next.add(permId);
      return { ...r, permissions: next };
    }));
  };

  const totalMembers = roles.reduce((s, r) => s + r.memberCount, 0);

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Roles & Permissions</p>
          <p className="module-subtitle">{roles.length} roles · {totalMembers} members · {ALL_PERMISSIONS.length} permissions</p>
        </div>
        <button className="btn-primary btn btn-sm"><Shield size={13} /> New Role</button>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Roles',      value: roles.length,                              color: 'text-fg1' },
            { label: 'Custom Roles',     value: roles.filter(r => !r.isSystem).length,     color: 'text-accent' },
            { label: 'Total Members',    value: totalMembers,                              color: 'text-bull' },
            { label: 'Permissions',      value: ALL_PERMISSIONS.length,                    color: 'text-fg2' },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <p className="kpi-label">{k.label}</p>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        <div className="chart-tabs">
          <button className={`chart-tab ${tab === 'matrix' ? 'active' : ''}`} onClick={() => setTab('matrix')}>Permission Matrix</button>
          <button className={`chart-tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>Roles</button>
        </div>

        {/* ── Permission Matrix ── */}
        {tab === 'matrix' && (
          <div className="card overflow-x-auto">
            <table className="data-table" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th className="sticky left-0 bg-[var(--bg-elevated)] z-10 min-w-[180px]">Permission</th>
                  {roles.map(r => (
                    <th key={r.id} className="text-center min-w-[100px]">
                      <div>
                        <p className={`text-[10px] font-semibold ${r.color}`}>{r.name}</p>
                        {r.isSystem && <p className="text-[8px] text-fg3">System</p>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_GROUPS.map(group => (
                  <>
                    <tr key={`hdr-${group.category}`}>
                      <td colSpan={roles.length + 1}
                        className="bg-[var(--bg-elevated)] py-1.5 px-3 text-[9px] font-bold uppercase tracking-wider text-fg3 sticky left-0">
                        {group.category}
                      </td>
                    </tr>
                    {group.permissions.map(perm => (
                      <tr key={perm.id}>
                        <td className="sticky left-0 bg-[var(--bg-panel)] text-[11px] text-fg2">
                          {perm.label}
                        </td>
                        {roles.map(r => {
                          const has = r.permissions.has(perm.id);
                          return (
                            <td key={r.id} className="text-center">
                              <button
                                onClick={() => togglePerm(r.id, perm.id)}
                                disabled={r.isSystem}
                                className={`mx-auto flex h-5 w-5 items-center justify-center rounded transition-colors
                                  ${has
                                    ? 'bg-bull/20 text-bull hover:bg-bull/30'
                                    : 'bg-[var(--bg-elevated)] text-fg3 hover:bg-[var(--border-md)]'}
                                  ${r.isSystem ? 'cursor-default' : 'cursor-pointer'}`}>
                                {has
                                  ? <Check size={10} strokeWidth={3} />
                                  : <X size={10} strokeWidth={2} className="opacity-30" />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[9px] text-fg3">System roles cannot be modified. Click cells to toggle custom role permissions.</p>
          </div>
        )}

        {/* ── Roles Tab ── */}
        {tab === 'roles' && (
          <div className="grid grid-cols-2 gap-4">
            {roles.map(r => (
              <div key={r.id}
                className={`card p-4 cursor-pointer transition-colors hover:border-[var(--border-hi)] ${selectedRole === r.id ? 'border-accent/40 bg-accent/5' : ''}`}
                onClick={() => setSelectedRole(selectedRole === r.id ? null : r.id)}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className={r.color} />
                    <p className={`text-[12px] font-semibold ${r.color}`}>{r.name}</p>
                    {r.isSystem && <span className="badge badge-muted text-[8px]">System</span>}
                  </div>
                  <span className="mono-cell text-[11px] text-fg2">{r.memberCount} members</span>
                </div>
                <p className="text-[10px] text-fg3 mb-3">{r.description}</p>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-fg3">{r.permissions.size} / {ALL_PERMISSIONS.length} permissions</span>
                  <div className="h-1.5 w-24 rounded-full bg-[var(--bg-elevated)]">
                    <div className="h-full rounded-full bg-accent"
                      style={{ width: `${(r.permissions.size / ALL_PERMISSIONS.length) * 100}%` }} />
                  </div>
                </div>
                {selectedRole === r.id && (
                  <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-1">
                    {Array.from(r.permissions).map(pid => {
                      const p = ALL_PERMISSIONS.find(x => x.id === pid);
                      return p ? (
                        <span key={pid} className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent">
                          {p.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
                {!r.isSystem && (
                  <div className="mt-3 flex gap-2">
                    <button className="btn-ghost btn btn-xs flex-1" onClick={e => e.stopPropagation()}>Edit</button>
                    <button className="btn-danger btn btn-xs" onClick={e => e.stopPropagation()}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
