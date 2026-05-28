/**
 * File:        apps/broker-admin/src/app/(admin)/team-members/page.tsx
 * Module:      broker-admin · Team · Members + Roles + Audit Log
 * Purpose:     Admin team management with permissions matrix and immutable audit trail
 *
 * Exports:
 *   - default (TeamMembersPage) — three sub-tabs: Members, Roles & Permissions, Audit Log
 *
 * Depends on:
 *   - @/lib/mock-data-context — useBrokerData() for teamMembers, auditLog
 *
 * Side-effects:
 *   - none (read-only view of team data)
 *
 * Key invariants:
 *   - Permissions matrix is display-only; "Create Custom Role" is a placeholder
 *   - Audit log is immutable — no edit or delete actions
 *   - avatarBg deterministic hash ensures consistent per-name colors
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState, useMemo } from 'react';
import { Shield, Activity, Users, Plus, Download } from 'lucide-react';
import { useBrokerData } from '@/lib/mock-data-context';

type SubTab = 'members' | 'roles' | 'audit';

const AVATAR_COLORS = ['#3B82F6', '#10D996', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#EF4444', '#84CC16'];
function avatarBg(name: string) {
  let h = 0;
  for (const c of name) h = ((h << 5) - h) + c.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  'Super Admin':         { bg: 'bg-bear/10',    color: 'text-bear'   },
  'Admin':               { bg: 'bg-accent/10',  color: 'text-accent' },
  'Compliance Officer':  { bg: 'bg-warn/10',    color: 'text-warn'   },
  'Compliance':          { bg: 'bg-warn/10',    color: 'text-warn'   },
  'Finance':             { bg: 'bg-bull/10',    color: 'text-bull'   },
  'Dealer':              { bg: 'bg-purple/10',  color: 'text-purple' },
  'Support':             { bg: 'bg-[var(--bg-elevated)]', color: 'text-fg2' },
  'Read Only':           { bg: 'bg-[var(--bg-elevated)]', color: 'text-fg3' },
};

function RolePill({ role }: { role: string }) {
  const s = ROLE_STYLE[role] ?? { bg: 'bg-[var(--bg-elevated)]', color: 'text-fg2' };
  return <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${s.bg} ${s.color}`}>{role}</span>;
}

// ─── PERMISSIONS MATRIX ───────────────────────────────────────────────────────
const ROLES = ['Super Admin', 'Admin', 'Compliance', 'Finance', 'Support', 'Dealer', 'Read Only'];
const PERMISSION_GROUPS = [
  { cat: 'CLIENTS',  perms: ['View', 'Edit', 'Create', 'Delete', 'KYC Approve', 'KYC Reject', 'Adjust Balance', 'Suspend'] },
  { cat: 'TRADING',  perms: ['View Instruments', 'Edit Instruments', 'View Orders', 'Cancel Orders'] },
  { cat: 'RISK',     perms: ['View Risk', 'Edit Limits', 'View Surveillance', 'Resolve Alerts'] },
  { cat: 'FINANCE',  perms: ['View Transactions', 'Approve Deposits', 'Approve Withdrawals', 'View P&L', 'Manage Bonuses'] },
  { cat: 'REPORTS',  perms: ['View Reports', 'Create Reports', 'Export Reports'] },
  { cat: 'PLATFORM', perms: ['View Settings', 'Edit Brand', 'Manage API'] },
  { cat: 'TEAM',     perms: ['View Members', 'Invite Members', 'Edit Roles', 'View Audit Log'] },
  { cat: 'DEALER',   perms: ['Access Workstation', 'Accept Orders', 'Reject Orders', 'Manual Quote'] },
];

const MATRIX: Record<string, 'all' | Record<string, boolean>> = {
  'Super Admin': 'all',
  'Admin':       { View: true, Edit: true, Create: true, 'KYC Approve': true, 'KYC Reject': true, 'Adjust Balance': true, Suspend: true, 'View Instruments': true, 'Edit Instruments': true, 'View Orders': true, 'Cancel Orders': true, 'View Risk': true, 'Edit Limits': true, 'View Surveillance': true, 'Resolve Alerts': true, 'View Transactions': true, 'Approve Deposits': true, 'Approve Withdrawals': true, 'View P&L': true, 'Manage Bonuses': true, 'View Reports': true, 'Create Reports': true, 'Export Reports': true, 'View Settings': true, 'Edit Brand': true, 'Manage API': true, 'View Members': true, 'Invite Members': true, 'Edit Roles': true, 'View Audit Log': true },
  'Compliance':  { View: true, 'KYC Approve': true, 'KYC Reject': true, 'View Risk': true, 'View Surveillance': true, 'Resolve Alerts': true, 'View Transactions': true, 'View Reports': true, 'View Members': true, 'View Audit Log': true, 'View Orders': true },
  'Finance':     { View: true, 'View Transactions': true, 'Approve Deposits': true, 'Approve Withdrawals': true, 'View P&L': true, 'Manage Bonuses': true, 'View Reports': true, 'Export Reports': true, 'Create Reports': true },
  'Support':     { View: true, Edit: true, Create: true, 'View Transactions': true, 'View Reports': true, 'View Members': true },
  'Dealer':      { 'View Instruments': true, 'View Orders': true, 'Cancel Orders': true, 'View Risk': true, 'Access Workstation': true, 'Accept Orders': true, 'Reject Orders': true, 'Manual Quote': true },
  'Read Only':   { View: true, 'View Transactions': true, 'View Reports': true, 'View Risk': true, 'View Instruments': true, 'View Orders': true },
};

function hasPerm(role: string, perm: string): boolean {
  const m = MATRIX[role];
  if (!m) return false;
  if (m === 'all') return true;
  return !!m[perm];
}

function PermissionsMatrix() {
  return (
    <div className="card overflow-x-auto">
      <table className="data-table" style={{ minWidth: 760 }}>
        <thead>
          <tr>
            <th className="w-52">Permission</th>
            {ROLES.map(r => (
              <th key={r} className="text-center"><RolePill role={r} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_GROUPS.map(({ cat, perms }) => (
            <>
              <tr key={cat}>
                <td colSpan={ROLES.length + 1} className="bg-[var(--bg-elevated)] px-3 py-2 font-display text-[9px] font-semibold tracking-widest text-fg3">
                  {cat}
                </td>
              </tr>
              {perms.map(perm => (
                <tr key={perm}>
                  <td className="pl-5 text-[11px] text-fg2">{perm}</td>
                  {ROLES.map(role => (
                    <td key={role} className="text-center">
                      {hasPerm(role, perm)
                        ? <span className="text-bull text-[13px]">✓</span>
                        : <span className="text-fg3 text-[13px]">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── AUDIT LOG VIEW ───────────────────────────────────────────────────────────
function AuditLogView() {
  const { auditLog } = useBrokerData();
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('All');

  const modules = useMemo(() => ['All', ...new Set(auditLog.map(e => e.module))], [auditLog]);

  const filtered = useMemo(() => auditLog.filter(e =>
    (module === 'All' || e.module === module) &&
    (!search || e.action.toLowerCase().includes(search.toLowerCase()) || e.actor.toLowerCase().includes(search.toLowerCase()))
  ), [auditLog, module, search]);

  const SEVERITY_DOT: Record<string, string> = {
    Info:     'bg-bull',
    Warning:  'bg-warn',
    Critical: 'bg-bear',
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <input className="input w-64" placeholder="Search actions, actors..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input w-40" value={module} onChange={e => setModule(e.target.value)}>
          {modules.map(m => <option key={m}>{m}</option>)}
        </select>
        <button className="btn-ghost btn btn-sm ml-auto"><Download size={12} /> Export CSV</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8"></th>
              <th>Actor</th>
              <th>Action</th>
              <th>Module</th>
              <th>Target</th>
              <th>IP</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(entry => (
              <tr key={entry.id}>
                <td>
                  <span className={`inline-block h-2 w-2 rounded-full ${SEVERITY_DOT[entry.severity] ?? 'bg-fg3'}`} />
                </td>
                <td>
                  <p className="text-[12px] font-medium text-fg1">{entry.actor}</p>
                  <p className="text-[10px] text-fg3">{entry.actorRole}</p>
                </td>
                <td className="text-[12px] text-fg1">{entry.action}</td>
                <td><span className="badge badge-muted">{entry.module}</span></td>
                <td className="mono-cell text-[11px] text-fg3">{entry.target ?? '—'}</td>
                <td className="mono-cell text-[11px] text-fg3">{entry.ip}</td>
                <td className="mono-cell text-[10px] text-fg3">{entry.timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MEMBERS LIST ─────────────────────────────────────────────────────────────
function MembersList() {
  const { teamMembers } = useBrokerData();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() =>
    teamMembers.filter(m =>
      !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
    ), [teamMembers, search]
  );

  const STATUS_DOT: Record<string, string> = { Active: 'bg-bull', Inactive: 'bg-[var(--fg3)]', Locked: 'bg-bear' };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <input className="input w-64" placeholder="Search name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn-primary btn btn-sm ml-auto"><Plus size={13} /> Invite Member</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Status</th>
              <th>2FA</th>
              <th>IP Restricted</th>
              <th>Last Login</th>
              <th>Since</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(member => (
              <tr key={member.id}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-bold text-white"
                      style={{ backgroundColor: avatarBg(member.name) }}>
                      {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-fg1">{member.name}</p>
                      <p className="text-[10px] text-fg3">{member.email}</p>
                    </div>
                  </div>
                </td>
                <td><RolePill role={member.role} /></td>
                <td>
                  <span className="flex items-center gap-1.5 text-[11px] text-fg2">
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[member.status] ?? 'bg-fg3'}`} />
                    {member.status}
                  </span>
                </td>
                <td>
                  {member.twoFAEnabled
                    ? <span className="badge badge-bull">Enabled</span>
                    : <span className="badge badge-muted">Off</span>}
                </td>
                <td>
                  {member.ipRestricted
                    ? <span className="badge badge-warn">Yes</span>
                    : <span className="text-[11px] text-fg3">No</span>}
                </td>
                <td className="mono-cell text-[10px] text-fg3">{member.lastLogin}</td>
                <td className="mono-cell text-[10px] text-fg3">{member.createdAt}</td>
                <td>
                  <button className="btn-ghost btn btn-xs">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function TeamMembersPage() {
  const { teamMembers, auditLog } = useBrokerData();
  const [subTab, setSubTab] = useState<SubTab>('members');

  const TABS: { id: SubTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'members', label: 'Team Members', icon: <Users size={13} />, count: teamMembers.length },
    { id: 'roles',   label: 'Roles & Permissions', icon: <Shield size={13} /> },
    { id: 'audit',   label: 'Audit Log', icon: <Activity size={13} />, count: auditLog.length },
  ];

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Team</p>
          <p className="module-subtitle">{teamMembers.filter(m => m.status === 'Active').length} active members · {ROLES.length} roles</p>
        </div>
      </div>

      <div className="border-b border-[var(--border)] px-6">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-3 font-sans text-[12px] transition-colors ${
                subTab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-fg3 hover:text-fg2'
              }`}
            >
              {t.icon} {t.label}
              {t.count !== undefined && <span className="mono-cell text-[9px]">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {subTab === 'members' && <MembersList />}
        {subTab === 'roles'   && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <button className="btn-primary btn btn-sm"><Plus size={13} /> Create Custom Role</button>
            </div>
            <PermissionsMatrix />
          </div>
        )}
        {subTab === 'audit' && <AuditLogView />}
      </div>
    </div>
  );
}
