/**
 * File:        apps/broker-admin/src/app/(admin)/domains/page.tsx
 * Module:      broker-admin · Platform · Domain Management
 * Purpose:     Standalone domain management page — full CRUD, DNS verification
 *              wizard, SSL status, and domain health monitoring.
 *
 * Exports:
 *   - default (DomainsPage) — domain management page
 *
 * Depends on:
 *   - ../../../lib/api/hooks/use-domains — useDomains
 *
 * Side-effects:
 *   - GET /tenancy/domains on mount
 *   - POST /tenancy/domains on add
 *   - DELETE /tenancy/domains/:id on remove
 *   - POST /tenancy/domains/:id/set-primary on set-primary
 *   - GET /tenancy/domains/verify/:domain on DNS check
 *   - GET /tenancy/domains/ssl/:domain on SSL check
 *
 * Key invariants:
 *   - Domain names always in font-mono
 *   - DNS verification shows expected TXT/A record value inline
 *   - SSL expiry warnings shown when certificate expires within 30 days
 *   - Primary domain cannot be deleted — only reassigned
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

'use client';

import { useState } from 'react';
import { Globe, Plus, Trash2, Star, RefreshCw, Loader, CheckCircle, XCircle, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import { useDomains } from '../../../lib/api/hooks/use-domains';
import type { DomainVerification } from '../../../lib/api/hooks/use-domains';

/* ── Sub-components ──────────────────────────────────────────────────────── */

function DnsVerificationPanel({ domain, verifyFn }: { domain: string; verifyFn: (d: string) => Promise<DomainVerification | null> }) {
  const [result, setResult] = useState<DomainVerification | null>(null);
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    const res = await verifyFn(domain);
    setResult(res);
    setChecking(false);
  };

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-2">
      <p className="text-[11px] uppercase tracking-widest text-fg3 font-display">DNS Verification</p>
      <button className="btn-ghost btn btn-xs" disabled={checking} onClick={handleCheck}>
        {checking ? <Loader size={12} className="inline animate-spin" /> : <RefreshCw size={12} />}
        Check DNS Records
      </button>
      {result && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {result.verified
              ? <span className="flex items-center gap-1 text-[11px] text-bull"><CheckCircle size={12} /> DNS Verified</span>
              : <span className="flex items-center gap-1 text-[11px] text-warn"><AlertTriangle size={12} /> Not Yet Verified</span>
            }
          </div>
          <div className="grid grid-cols-3 gap-x-3 text-[11px]">
            <span className="text-fg3">Record Type</span>
            <span className="mono-cell font-mono text-fg1 col-span-2">{result.recordType}</span>
            <span className="text-fg3">Expected Value</span>
            <span className="mono-cell font-mono text-accent col-span-2">{result.expectedValue}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SslPanel({ domain, sslActive, sslExpiresAt, checkFn }: { domain: string; sslActive: boolean; sslExpiresAt: string | null; checkFn: (d: string) => Promise<{ active: boolean; expiresAt: string | null } | null> }) {
  const [checking, setChecking] = useState(false);

  const daysUntilExpiry = sslExpiresAt
    ? Math.ceil((new Date(sslExpiresAt).getTime() - Date.now()) / 86400000)
    : null;

  const handleCheck = async () => {
    setChecking(true);
    await checkFn(domain);
    setChecking(false);
  };

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-2">
      <p className="text-[11px] uppercase tracking-widest text-fg3 font-display">SSL Certificate</p>
      <div className="flex items-center gap-2">
        {sslActive ? (
          <span className="flex items-center gap-1 text-[11px] text-bull"><ShieldCheck size={12} /> SSL Active</span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-bear"><XCircle size={12} /> SSL Inactive</span>
        )}
        {daysUntilExpiry !== null && daysUntilExpiry <= 30 && (
          <span className="flex items-center gap-1 text-[11px] text-warn">
            <AlertTriangle size={12} />
            {daysUntilExpiry <= 0 ? 'Expired' : `Expires in ${daysUntilExpiry}d`}
          </span>
        )}
      </div>
      {sslExpiresAt && (
        <p className="mono-cell text-[11px] font-mono text-fg3">
          Expires: {new Date(sslExpiresAt).toLocaleDateString()}
        </p>
      )}
      <button className="btn-ghost btn btn-xs" disabled={checking} onClick={handleCheck}>
        {checking ? <Loader size={12} className="inline animate-spin" /> : <RefreshCw size={12} />}
        Check SSL
      </button>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */

export default function DomainsPage() {
  const { domains, isLoading, isAdding, removingDomainId, error, addDomain, removeDomain, setPrimary, verifyDns, checkSsl } = useDomains();
  const [newDomainInput, setNewDomainInput] = useState('');
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  const handleAdd = async () => {
    const trimmed = newDomainInput.trim();
    if (!trimmed) return;
    const ok = await addDomain(trimmed);
    if (ok) setNewDomainInput('');
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="module-header">
        <div>
          <p className="module-title">Domain Management</p>
          <p className="module-subtitle">Register, verify, and manage custom domains</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border border-[var(--border)] rounded px-3 py-1.5">
            <Globe size={13} className="text-fg3" />
            <span className="mono-cell text-[12px] font-mono text-fg2">{domains.length} domain{domains.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: 'var(--bear-dim)', border: '1px solid var(--bear)', borderRadius: 6, fontSize: 12, color: 'var(--bear)' }}>
          {error}
        </div>
      )}

      <div className="p-6 space-y-5">
        {/* Add domain */}
        <div className="rounded-lg border border-[var(--border)] p-5 space-y-3">
          <p className="text-[11px] uppercase tracking-widest text-fg3 font-display">Register New Domain</p>
          <div className="flex items-center gap-3">
            <input
              className="input flex-1 mono-cell text-[13px] font-mono"
              placeholder="trade.acme.com"
              value={newDomainInput}
              onChange={e => setNewDomainInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button className="btn-primary btn btn-sm flex items-center gap-2" disabled={isAdding || !newDomainInput.trim()} onClick={handleAdd}>
              {isAdding ? <Loader size={12} className="inline animate-spin" /> : <Plus size={12} />}
              Add Domain
            </button>
          </div>
          <p className="text-[11px] text-fg3">Enter the custom domain you want to map to your broker platform.</p>
        </div>

        {/* Domain list */}
        <div>
          <p className="text-[11px] uppercase tracking-widest text-fg3 font-display mb-3">Registered Domains</p>
          {isLoading && domains.length === 0 ? (
            <div className="flex items-center gap-2 py-12 text-fg3">
              <Loader size={18} className="animate-spin" /> Loading domains…
            </div>
          ) : domains.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-fg3 rounded-lg border border-dashed border-[var(--border)]">
              <Globe size={32} className="opacity-30" />
              <p className="text-[12px]">No domains registered yet. Add one above to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {domains.map(domain => (
                <div key={domain.id} className="rounded-lg border border-[var(--border)] overflow-hidden">
                  {/* Row */}
                  <div
                    className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                    onClick={() => setExpandedDomain(expandedDomain === domain.id ? null : domain.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="mono-cell text-[13px] font-mono font-semibold text-fg1 truncate">{domain.domain}</p>
                        {domain.isPrimary && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-bull shrink-0">
                            <Star size={10} fill="currentColor" /> Primary
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-fg3 mt-0.5">
                        Added {new Date(domain.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* DNS status */}
                    <div className="flex items-center gap-2 shrink-0">
                      {domain.isVerified ? (
                        <span className="flex items-center gap-1 text-[11px] text-bull"><CheckCircle size={12} /> DNS Verified</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-warn"><AlertTriangle size={12} /> DNS Pending</span>
                      )}
                    </div>

                    {/* SSL status */}
                    <div className="flex items-center gap-2 shrink-0">
                      {domain.sslActive ? (
                        <span className="flex items-center gap-1 text-[11px] text-bull"><ShieldCheck size={12} /> SSL Active</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-bear"><ShieldAlert size={12} /> SSL Inactive</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!domain.isPrimary && (
                        <button
                          className="btn-ghost btn btn-xs text-[11px]"
                          disabled={removingDomainId === domain.id}
                          onClick={e => { e.stopPropagation(); setPrimary(domain.id); }}
                        >
                          <Star size={11} /> Set Primary
                        </button>
                      )}
                      <button
                        className="btn-danger btn btn-xs text-[11px]"
                        disabled={(removingDomainId === domain.id) || domain.isPrimary}
                        onClick={e => { e.stopPropagation(); removeDomain(domain.id); }}
                      >
                        {removingDomainId === domain.id ? <Loader size={11} className="inline animate-spin" /> : <Trash2 size={11} />}
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedDomain === domain.id && (
                    <div className="border-t border-[var(--border)] bg-[var(--bg-base)] px-4 py-4 grid grid-cols-2 gap-4">
                      <DnsVerificationPanel domain={domain.domain} verifyFn={verifyDns} />
                      <SslPanel
                        domain={domain.domain}
                        sslActive={domain.sslActive}
                        sslExpiresAt={domain.sslExpiresAt}
                        checkFn={checkSsl}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DNS quick reference */}
        <div className="rounded-lg border border-[var(--border)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-accent" />
            <p className="text-[11px] uppercase tracking-widest text-fg3 font-display">Quick DNS Reference</p>
          </div>
          <p className="text-[12px] text-fg3">Point your custom domain to the platform by adding an A record at your registrar:</p>
          <div className="rounded border border-[var(--border)] overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Host</th>
                  <th>Value</th>
                  <th>TTL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono-cell text-[12px] font-mono text-bull">A</td>
                  <td className="mono-cell text-[12px] font-mono text-fg1">@</td>
                  <td className="mono-cell text-[12px] font-mono text-accent">Your platform IP (see deployment page)</td>
                  <td className="mono-cell text-[11px] font-mono text-fg3">3600</td>
                </tr>
                <tr>
                  <td className="mono-cell text-[12px] font-mono text-bull">CNAME</td>
                  <td className="mono-cell text-[12px] font-mono text-fg1">www</td>
                  <td className="mono-cell text-[12px] font-mono text-accent">Your platform domain</td>
                  <td className="mono-cell text-[11px] font-mono text-fg3">3600</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}