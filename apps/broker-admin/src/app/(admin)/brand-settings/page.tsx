/**
 * File:        apps/broker-admin/src/app/(admin)/brand-settings/page.tsx
 * Module:      broker-admin · Platform · Brand Settings
 * Purpose:     Broker identity, contact details, color scheme, legal docs, domain
 *              management, and deployment status. Now wired to real backend via
 *              useBrandSettings, useDomains, and useDeployment hooks.
 *
 * Exports:
 *   - default (BrandSettingsPage) — tabbed brand editor with live terminal preview
 *
 * Depends on:
 *   - ../../../lib/api/hooks/use-brand-settings — useBrandSettings (API-backed)
 *   - ../../../lib/api/hooks/use-domains        — useDomains
 *   - ../../../lib/api/hooks/use-deployment     — useDeployment
 *
 * Side-effects:
 *   - POST /broker-setup/brand-config on save
 *   - POST/DELETE/GET /tenancy/domains via useDomains
 *   - GET /admin/deployment/status via useDeployment
 *
 * Key invariants:
 *   - All color inputs are hex strings; preview updates live
 *   - Legal doc re-accept flag controls whether clients must re-accept on next login
 *   - API fields: appName, tagline, supportEmail, supportPhone, primaryColor, logoUrl, faviconUrl
 *   - Local-only fields: legalName, address, regBody, licenseNo, bullColor, bearColor, legalDocs, footerLinks
 *   - Tabs: identity | colors | legal | footer | domains | deployment
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

'use client';

import { useEffect, useState } from 'react';
import { Save, Plus, Globe, Server, CheckCircle, XCircle, ShieldCheck, Loader, Trash2, Star, RefreshCw, Eye, AlertTriangle } from 'lucide-react';
import { useBrandSettings } from '../../../lib/api/hooks/use-brand-settings';
import { useDomains } from '../../../lib/api/hooks/use-domains';
import { useDeployment } from '../../../lib/api/hooks/use-deployment';

type Brand = {
  name: string;
  legalName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  address: string;
  regBody: string;
  licenseNo: string;
  primaryColor: string;
  bullColor: string;
  bearColor: string;
};

type LegalDoc = {
  id: string;
  label: string;
  version: string;
  effective: string;
  reaccept: boolean;
};

const DEFAULT_BRAND: Brand = {
  name: 'ArcaFX Markets',
  legalName: 'ArcaFX Markets Ltd.',
  tagline: 'Professional FX & CFD Trading',
  supportEmail: 'support@arcafx.com',
  supportPhone: '+1 800 ARCAFX',
  address: 'Suite 201, Oliaji Trade Centre, Victoria, Mahé, Seychelles',
  regBody: 'Seychelles FSA',
  licenseNo: 'SD052',
  primaryColor: '#3B82F6',
  bullColor: '#10D996',
  bearColor: '#FF3B5C',
};

const DEFAULT_LEGAL: LegalDoc[] = [
  { id: 'tos',     label: 'Terms & Conditions', version: 'v4.2', effective: '2024-01-01', reaccept: true  },
  { id: 'privacy', label: 'Privacy Policy',      version: 'v3.1', effective: '2023-08-01', reaccept: false },
  { id: 'risk',    label: 'Risk Disclosure',      version: 'v2.0', effective: '2023-01-01', reaccept: true  },
  { id: 'client',  label: 'Client Agreement',     version: 'v5.0', effective: '2024-01-01', reaccept: true  },
];

const FOOTER_LINKS = [
  { label: 'Terms & Conditions', url: '/legal/terms' },
  { label: 'Privacy Policy',     url: '/legal/privacy' },
  { label: 'Risk Disclosure',    url: '/legal/risk' },
  { label: 'Contact Us',         url: '/contact' },
  { label: 'FSA Registration',   url: 'https://fsaseychelles.sc' },
];

function ColorSwatch({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="kpi-label mb-1 block">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="h-8 w-12 cursor-pointer rounded border border-[var(--border)] bg-transparent" />
        <input className="input flex-1 mono-cell text-[11px]" value={value}
          onChange={e => onChange(e.target.value)} />
      </div>
    </div>
  );
}

function TerminalPreview({ brand }: { brand: Brand }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#06080A] text-[11px]"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
      {/* Mock topbar */}
      <div className="flex items-center justify-between border-b border-white/8 px-3 py-2"
        style={{ background: '#0C0E12' }}>
        <p className="font-display text-[13px] font-bold tracking-wide"
          style={{ color: brand.primaryColor }}>{brand.name}</p>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: brand.bullColor }} />
          <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Live</p>
        </div>
      </div>
      {/* Mock instrument row */}
      <div className="flex items-center gap-4 border-b border-white/5 px-3 py-2">
        <p className="font-mono font-bold text-[12px] text-white">EUR/USD</p>
        <p className="font-mono text-[12px]" style={{ color: brand.bullColor }}>1.08942</p>
        <p className="font-mono text-[10px]" style={{ color: brand.bullColor }}>+0.18%</p>
      </div>
      {/* Mock buttons */}
      <div className="flex gap-2 p-3">
        <div className="flex-1 rounded py-1.5 text-center text-[11px] font-bold text-white"
          style={{ background: brand.bullColor + '30', border: `1px solid ${brand.bullColor}50` }}>
          BUY
        </div>
        <div className="flex-1 rounded py-1.5 text-center text-[11px] font-bold text-white"
          style={{ background: brand.bearColor + '30', border: `1px solid ${brand.bearColor}50` }}>
          SELL
        </div>
      </div>
      <div className="px-3 pb-2">
        <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Powered by {brand.name} · {brand.regBody} {brand.licenseNo}
        </p>
      </div>
    </div>
  );
}

export default function BrandSettingsPage() {
  const { config, isLoading, isSaving, error, upsert } = useBrandSettings();
  const [legal, setLegal] = useState<LegalDoc[]>(DEFAULT_LEGAL);
  const [tab, setTab] = useState<'identity' | 'colors' | 'legal' | 'footer' | 'domains' | 'deployment'>('identity');
  const [saved, setSaved] = useState(false);

  /* domains */
  const { domains, isLoading: domainsLoading, isAdding, removingDomainId, error: domainsError, addDomain, removeDomain, setPrimary, verifyDns, checkSsl, refetch: refetchDomains } = useDomains();
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);
  const [sslCheckingDomain, setSslCheckingDomain] = useState<string | null>(null);
  const [newDomainInput, setNewDomainInput] = useState('');

  /* deployment */
  const { status: deployStatus, isLoading: deployLoading, isDeploying, error: deployError } = useDeployment();

  // API-backed fields (synced to backend)
  const [brand, setBrand] = useState<Brand>(
    config
      ? {
          ...DEFAULT_BRAND,
          name:        config.appName || DEFAULT_BRAND.name,
          tagline:     config.tagline || DEFAULT_BRAND.tagline,
          primaryColor: config.primaryColor || DEFAULT_BRAND.primaryColor,
          supportEmail: config.supportEmail || DEFAULT_BRAND.supportEmail,
          supportPhone: config.supportPhone || DEFAULT_BRAND.supportPhone,
        }
      : DEFAULT_BRAND,
  );

  // Sync from API when config loads after mount
  useEffect(() => {
    if (config) {
      setBrand(b => ({
        ...b,
        name:        config.appName || b.name,
        tagline:     config.tagline || b.tagline,
        primaryColor: config.primaryColor || b.primaryColor,
        supportEmail: config.supportEmail || b.supportEmail,
        supportPhone: config.supportPhone || b.supportPhone,
      }));
    }
  }, [config]);

  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => setBrand(b => ({ ...b, [k]: v }));

  const handleSave = async () => {
    if (!config) return;
    const success = await upsert({
      appName:       brand.name,
      tagline:       brand.tagline,
      primaryColor:  brand.primaryColor,
      logoUrl:       config.logoUrl,
      faviconUrl:    config.faviconUrl,
      supportEmail:  brand.supportEmail,
      supportPhone:  brand.supportPhone,
      customDomain:  config.customDomain,
    });
    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const saveBtnLabel = isSaving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes';

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Brand Settings</p>
          <p className="module-subtitle">Broker identity, colors, legal documents</p>
        </div>
        <button className="btn-primary btn btn-sm" disabled={isSaving || !config} onClick={handleSave}>
          <Save size={13} /> {saveBtnLabel}
        </button>
      </div>

      <div className="p-6">
        {error && (
          <div style={{ padding: '8px 12px', background: 'var(--bear-dim)', border: '1px solid var(--bear)', borderRadius: 6, fontSize: 12, color: 'var(--bear)' }}>
            {error}
          </div>
        )}
        <div className="grid grid-cols-[1fr_280px] gap-5">
          <div className="space-y-4">
            {/* Tabs */}
            <div className="chart-tabs">
              {(['identity', 'colors', 'legal', 'footer', 'domains', 'deployment'] as const).map(t => (
                <button key={t} className={`chart-tab capitalize ${tab === t ? 'active' : ''}`}
                  onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>

            <div className="card p-5">
              {/* Identity */}
              {tab === 'identity' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="kpi-label mb-1 block">Brand Name</label>
                    <input className="input" value={brand.name} onChange={e => set('name', e.target.value)} />
                  </div>
                  <div>
                    <label className="kpi-label mb-1 block">Legal Name</label>
                    <input className="input" value={brand.legalName} onChange={e => set('legalName', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="kpi-label mb-1 block">Tagline</label>
                    <input className="input" value={brand.tagline} onChange={e => set('tagline', e.target.value)} />
                  </div>
                  <div>
                    <label className="kpi-label mb-1 block">Support Email</label>
                    <input className="input" type="email" value={brand.supportEmail} onChange={e => set('supportEmail', e.target.value)} />
                  </div>
                  <div>
                    <label className="kpi-label mb-1 block">Support Phone</label>
                    <input className="input" value={brand.supportPhone} onChange={e => set('supportPhone', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="kpi-label mb-1 block">Registered Address</label>
                    <input className="input" value={brand.address} onChange={e => set('address', e.target.value)} />
                  </div>
                  <div>
                    <label className="kpi-label mb-1 block">Regulatory Body</label>
                    <input className="input" value={brand.regBody} onChange={e => set('regBody', e.target.value)} />
                  </div>
                  <div>
                    <label className="kpi-label mb-1 block">License Number</label>
                    <input className="input mono-cell" value={brand.licenseNo} onChange={e => set('licenseNo', e.target.value)} />
                  </div>
                </div>
              )}

              {/* Colors */}
              {tab === 'colors' && (
                <div className="grid grid-cols-3 gap-4">
                  <ColorSwatch label="Primary / Accent" value={brand.primaryColor} onChange={v => set('primaryColor', v)} />
                  <ColorSwatch label="Bull (Long / Up)"  value={brand.bullColor}    onChange={v => set('bullColor', v)} />
                  <ColorSwatch label="Bear (Short / Down)" value={brand.bearColor}  onChange={v => set('bearColor', v)} />
                  <div className="col-span-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                    <p className="text-[11px] text-fg3">
                      Color changes affect the trader terminal, client portal, and all branded emails.
                      The dark background (#06080A) is fixed for readability.
                    </p>
                  </div>
                </div>
              )}

              {/* Legal docs */}
              {tab === 'legal' && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button className="btn-ghost btn btn-sm"><Plus size={13} /> Upload Document</button>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Version</th>
                        <th>Effective</th>
                        <th>Re-accept Required</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {legal.map(doc => (
                        <tr key={doc.id}>
                          <td className="text-[12px] font-medium text-fg1">{doc.label}</td>
                          <td className="mono-cell text-[11px] text-accent">{doc.version}</td>
                          <td className="mono-cell text-[11px] text-fg2">{doc.effective}</td>
                          <td>
                            <button
                              className={`relative h-5 w-9 rounded-full transition-colors ${doc.reaccept ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}
                              onClick={() => setLegal(ld => ld.map(d => d.id === doc.id ? { ...d, reaccept: !d.reaccept } : d))}>
                              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${doc.reaccept ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                          </td>
                          <td>
                            <button className="btn-ghost btn btn-xs">Edit</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer links */}
              {tab === 'footer' && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button className="btn-ghost btn btn-sm"><Plus size={13} /> Add Link</button>
                  </div>
                  <div className="space-y-2">
                    {FOOTER_LINKS.map((link, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-3">
                        <input className="input text-[12px]" defaultValue={link.label} />
                        <input className="input mono-cell text-[11px]" defaultValue={link.url} />
                        <button className="btn-danger btn btn-xs">Del</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Domains */}
              {tab === 'domains' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-widest text-fg3 font-display">Registered Domains</p>
                    <button className="btn-ghost btn btn-xs" onClick={() => refetchDomains()}>
                      <RefreshCw size={12} /> Refresh
                    </button>
                  </div>
                  {domainsError && (
                    <div style={{ padding: '8px 12px', background: 'var(--bear-dim)', border: '1px solid var(--bear)', borderRadius: 6, fontSize: 12, color: 'var(--bear)' }}>
                      {domainsError}
                    </div>
                  )}
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Domain</th>
                        <th>Type</th>
                        <th>DNS Status</th>
                        <th>SSL</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {domainsLoading && domains.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-6 text-fg3"><Loader size={16} className="inline animate-spin" /> Loading domains…</td></tr>
                      ) : domains.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-6 text-fg3">No domains registered. Add one below.</td></tr>
                      ) : (
                        domains.map(d => (
                          <tr key={d.id}>
                            <td className="mono-cell text-[12px] font-mono text-fg1">{d.domain}</td>
                            <td>{d.isPrimary ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-bull">
                                <Star size={10} fill="currentColor" /> Primary
                              </span>
                            ) : (
                              <span className="text-[11px] text-fg3">Custom</span>
                            )}</td>
                            <td>{d.isVerified ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-bull"><CheckCircle size={12} /> Verified</span>
                            ) : (
                              <button
                                className="btn-ghost btn btn-xs"
                                disabled={verifyingDomain === d.domain}
                                onClick={async () => {
                                  setVerifyingDomain(d.domain);
                                  const result = await verifyDns(d.domain);
                                  setVerifyingDomain(null);
                                  if (result?.verified) refetchDomains();
                                }}
                              >
                                {verifyingDomain === d.domain ? <Loader size={12} className="inline animate-spin" /> : <RefreshCw size={12} />}
                                Verify DNS
                              </button>
                            )}</td>
                            <td>{d.sslActive ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-bull"><ShieldCheck size={12} /> Active</span>
                            ) : (
                              <button
                                className="btn-ghost btn btn-xs"
                                disabled={sslCheckingDomain === d.domain}
                                onClick={async () => {
                                  setSslCheckingDomain(d.domain);
                                  await checkSsl(d.domain);
                                  setSslCheckingDomain(null);
                                  refetchDomains();
                                }}
                              >
                                {sslCheckingDomain === d.domain ? <Loader size={12} className="inline animate-spin" /> : <ShieldCheck size={12} />}
                                Check SSL
                              </button>
                            )}</td>
                            <td>
                              <div className="flex items-center gap-1">
                                {!d.isPrimary && (
                                  <button className="btn-ghost btn btn-xs text-[11px]" disabled={removingDomainId === d.id} onClick={() => setPrimary(d.id)}>
                                    Set Primary
                                  </button>
                                )}
                                <button className="btn-danger btn btn-xs" disabled={removingDomainId === d.id || d.isPrimary} onClick={() => removeDomain(d.id)}>
                                  {removingDomainId === d.id ? <Loader size={12} className="inline animate-spin" /> : <Trash2 size={12} />} Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {/* Add domain inline form */}
                  <div className="flex items-center gap-2 border-t border-[var(--border)] pt-3">
                    <input
                      className="input flex-1 mono-cell text-[12px]"
                      placeholder="custom.example.com"
                      value={newDomainInput}
                      onChange={e => setNewDomainInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newDomainInput.trim()) { addDomain(newDomainInput.trim()); setNewDomainInput(''); } }}
                    />
                    <button className="btn-primary btn btn-sm" disabled={isAdding || !newDomainInput.trim()} onClick={() => { addDomain(newDomainInput.trim()); setNewDomainInput(''); }}>
                      {isAdding ? <Loader size={12} className="inline animate-spin" /> : <Plus size={12} />} Add Domain
                    </button>
                  </div>

                  {/* Deployment Status Card */}
                  {deployStatus && (
                    <div className="rounded-lg border border-[var(--border)] p-4 mt-2 space-y-3">
                      <p className="text-[11px] uppercase tracking-widest text-fg3 font-display">Deployment Status</p>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-fg3">Web App URL</p>
                          <p className="mono-cell text-[12px] font-mono text-accent">{deployStatus.webAppUrl}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-fg3">Version</p>
                          <p className="mono-cell text-[12px] font-mono text-fg1">{deployStatus.version}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-fg3">Last Deployed</p>
                          <p className="mono-cell text-[12px] font-mono text-fg2">{deployStatus.lastDeployed ? new Date(deployStatus.lastDeployed).toLocaleString() : 'Never'}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${deployStatus.status === 'ACTIVE' ? 'text-bull' : deployStatus.status === 'DEPLOYING' ? 'text-warn' : 'text-bear'}`}>
                          {deployStatus.status === 'ACTIVE' ? <CheckCircle size={14} /> : deployStatus.status === 'DEPLOYING' ? <Loader size={14} className="animate-spin" /> : <XCircle size={14} />}
                          {deployStatus.status}
                        </span>
                        <a href="/deployment" className="btn-ghost btn btn-xs text-[11px]">
                          <Eye size={12} /> Full Dashboard
                        </a>
                      </div>
                      {/* Health grid */}
                      <div className="grid grid-cols-5 gap-2">
                        {([['api', 'API'], ['db', 'PostgreSQL'], ['redis', 'Redis'], ['ws', 'WebSocket'], ['graphql', 'GraphQL']] as const).map(([key, label]) => (
                          <div key={key} className={`flex flex-col items-center rounded border border-[var(--border)] p-2 ${deployStatus.health[key] ? 'bg-bull/10 border-bull/30' : 'bg-bear/10 border-bear/30'}`}>
                            <div className={`h-1.5 w-1.5 rounded-full mb-1 ${deployStatus.health[key] ? 'bg-bull' : 'bg-bear'}`} />
                            <p className="text-[10px] text-fg3">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Deployment */}
              {tab === 'deployment' && (
                <div className="space-y-4">
                  <p className="text-[11px] uppercase tracking-widest text-fg3 font-display">Web App Deployment</p>
                  {deployError && (
                    <div style={{ padding: '8px 12px', background: 'var(--bear-dim)', border: '1px solid var(--bear)', borderRadius: 6, fontSize: 12, color: 'var(--bear)' }}>
                      {deployError}
                    </div>
                  )}
                  {deployLoading && !deployStatus ? (
                    <div className="flex items-center gap-2 py-8 text-fg3">
                      <Loader size={16} className="animate-spin" /> Loading deployment info…
                    </div>
                  ) : deployStatus ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg border border-[var(--border)] p-4 space-y-2">
                          <p className="text-[10px] uppercase tracking-widest text-fg3">Current Version</p>
                          <p className="mono-cell text-[16px] font-mono font-bold text-fg1">{deployStatus.version}</p>
                          <p className="text-[11px] text-fg3">Deployed {deployStatus.lastDeployed ? new Date(deployStatus.lastDeployed).toLocaleString() : 'never'}</p>
                        </div>
                        <div className="rounded-lg border border-[var(--border)] p-4 space-y-2">
                          <p className="text-[10px] uppercase tracking-widest text-fg3">Status</p>
                          <p className={`text-[16px] font-bold ${deployStatus.status === 'ACTIVE' ? 'text-bull' : deployStatus.status === 'DEPLOYING' ? 'text-warn' : 'text-bear'}`}>
                            {deployStatus.status}
                          </p>
                          <p className="mono-cell text-[11px] font-mono text-accent">{deployStatus.webAppUrl}</p>
                        </div>
                      </div>

                      {/* Server health grid */}
                      <div>
                        <p className="text-[11px] uppercase tracking-widest text-fg3 font-display mb-2">Server Health</p>
                        <div className="grid grid-cols-5 gap-2">
                          {([['api', 'API Gateway'], ['db', 'PostgreSQL'], ['redis', 'Redis'], ['ws', 'WebSocket'], ['graphql', 'GraphQL']] as const).map(([key, label]) => (
                            <div key={key} className={`flex flex-col items-center rounded border p-3 ${deployStatus.health[key] ? 'border-[var(--border)] bg-[var(--bg-elevated)]' : 'border-bear/40 bg-bear/10'}`}>
                              <div className={`h-2 w-2 rounded-full mb-2 ${deployStatus.health[key] ? 'bg-bull shadow-[0_0_6px_var(--bull)]' : 'bg-bear shadow-[0_0_6px_var(--bear)]'}`} />
                              <p className="text-[11px] text-fg2">{label}</p>
                              <p className={`text-[10px] ${deployStatus.health[key] ? 'text-bull' : 'text-bear'}`}>
                                {deployStatus.health[key] ? 'Online' : 'Offline'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* DNS config guide */}
                      <div className="rounded-lg border border-[var(--border)] p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Globe size={14} className="text-accent" />
                          <p className="text-[11px] uppercase tracking-widest text-fg3 font-display">DNS Configuration Guide</p>
                        </div>
                        <p className="text-[11px] text-fg3">Add the following DNS records to your domain registrar to enable custom domain hosting:</p>
                        <div className="space-y-2">
                          <div className="grid grid-cols-[100px_1fr] gap-x-4 text-[11px]">
                            <span className="text-fg3">Record Type</span>
                            <span className="mono-cell font-mono text-fg1">A Record</span>
                          </div>
                          <div className="grid grid-cols-[100px_1fr] gap-x-4 text-[11px]">
                            <span className="text-fg3">Hostname</span>
                            <span className="mono-cell font-mono text-fg1">@</span>
                          </div>
                          <div className="grid grid-cols-[100px_1fr] gap-x-4 text-[11px]">
                            <span className="text-fg3">Value / IP</span>
                            <span className="mono-cell font-mono text-accent">{deployStatus.webAppUrl}</span>
                          </div>
                          <div className="grid grid-cols-[100px_1fr] gap-x-4 text-[11px]">
                            <span className="text-fg3">TTL</span>
                            <span className="mono-cell font-mono text-fg2">3600 (1 hour)</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end">
                        <a href="/deployment" className="btn-primary btn btn-sm flex items-center gap-2">
                          <Server size={13} /> Open Full Deployment Dashboard
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-fg3">No deployment data available.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Live preview */}
          <div className="space-y-3">
            <p className="kpi-label">Live Preview</p>
            <TerminalPreview brand={brand} />
            <div className="rounded-lg border border-[var(--border)] p-3 text-[11px] space-y-1">
              <p className="kpi-label mb-1">Broker Identity</p>
              <p className="text-fg1 font-semibold">{brand.name}</p>
              <p className="text-fg3">{brand.legalName}</p>
              <p className="text-fg3">{brand.regBody} · {brand.licenseNo}</p>
              <p className="text-fg3 mt-2">{brand.supportEmail}</p>
              <p className="text-fg3">{brand.supportPhone}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
