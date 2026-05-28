/**
 * File:        apps/broker-admin/src/app/(admin)/email-templates/page.tsx
 * Module:      broker-admin · Platform · Email Templates
 * Purpose:     16-template email editor with merge tag reference and live preview
 *
 * Exports:
 *   - default (EmailTemplatesPage) — split-panel template list + editor + live preview
 *
 * Depends on:
 *   - none (all templates and merge tags are local constants)
 *
 * Side-effects:
 *   - Mock send-test: 3s timeout then resets
 *
 * Key invariants:
 *   - Merge tags are double-brace {{variable}} syntax
 *   - Preview replaces all merge tags with SAMPLE_DATA values
 *   - Template body falls back to generic text if not in DEFAULT_BODIES
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Send, Eye, EyeOff } from 'lucide-react';

type EmailTemplate = {
  id: string;
  label: string;
  category: string;
  subject: string;
};

const TEMPLATES: EmailTemplate[] = [
  { id: 'welcome',         label: 'Welcome Email',              category: 'Account',    subject: 'Welcome to {{broker.name}}, {{client.first_name}}!' },
  { id: 'email-verify',    label: 'Email Verification',          category: 'Account',    subject: 'Verify your email address' },
  { id: 'kyc-approved',    label: 'KYC Approved',                category: 'KYC',        subject: 'Your account has been verified' },
  { id: 'kyc-rejected',    label: 'KYC Rejected',                category: 'KYC',        subject: 'Action required: Identity verification' },
  { id: 'kyc-docs-req',    label: 'KYC Documents Requested',     category: 'KYC',        subject: 'Please upload additional documents' },
  { id: 'margin-call',     label: 'Margin Call Warning',         category: 'Trading',    subject: 'Margin call warning on your account' },
  { id: 'stop-out',        label: 'Stop-Out Executed',           category: 'Trading',    subject: 'Positions closed: margin level reached stop-out' },
  { id: 'deposit-confirm', label: 'Deposit Confirmed',           category: 'Finance',    subject: 'Deposit of {{txn.amount}} confirmed' },
  { id: 'withdrawal-ok',   label: 'Withdrawal Approved',         category: 'Finance',    subject: 'Your withdrawal has been processed' },
  { id: 'withdrawal-rej',  label: 'Withdrawal Rejected',         category: 'Finance',    subject: 'Withdrawal request update' },
  { id: 'password-reset',  label: 'Password Reset',              category: 'Security',   subject: 'Reset your {{broker.name}} password' },
  { id: 'new-login',       label: 'New Login from Device',       category: 'Security',   subject: 'New sign-in to your account' },
  { id: 'account-susp',    label: 'Account Suspended',           category: 'Account',    subject: 'Your account has been suspended' },
  { id: 'bonus-awarded',   label: 'Bonus Awarded',               category: 'Finance',    subject: 'You have received a {{bonus.amount}} bonus!' },
  { id: 'ib-commission',   label: 'IB Commission Paid',          category: 'IB',         subject: 'Your commission payment has been sent' },
  { id: 'reg-reminder',    label: 'Regulatory Reminder',         category: 'Compliance', subject: 'Important: Account compliance update required' },
];

const MERGE_TAG_GROUPS = [
  { group: 'Client',      tags: ['{{client.first_name}}','{{client.last_name}}','{{client.full_name}}','{{client.email}}','{{client.account_id}}','{{client.account_type}}'] },
  { group: 'Broker',      tags: ['{{broker.name}}','{{broker.support_email}}','{{broker.support_phone}}','{{broker.website}}','{{broker.license_no}}'] },
  { group: 'Transaction', tags: ['{{txn.type}}','{{txn.amount}}','{{txn.currency}}','{{txn.method}}','{{txn.date}}','{{txn.reference}}'] },
  { group: 'Trading',     tags: ['{{trade.symbol}}','{{trade.lots}}','{{trade.direction}}','{{trade.pnl}}','{{margin.level}}','{{margin.call_level}}'] },
  { group: 'KYC',         tags: ['{{kyc.document_type}}','{{kyc.rejection_reason}}','{{kyc.review_link}}'] },
  { group: 'Bonus',       tags: ['{{bonus.type}}','{{bonus.amount}}','{{bonus.expiry}}','{{bonus.wagering_req}}'] },
];

const SAMPLE_DATA: Record<string, string> = {
  '{{client.first_name}}':   'Alexander',
  '{{client.last_name}}':    'Mitchell',
  '{{client.full_name}}':    'Alexander Mitchell',
  '{{client.email}}':        'a.mitchell@gmail.com',
  '{{client.account_id}}':   'C1001',
  '{{client.account_type}}': 'VIP',
  '{{broker.name}}':         'ArcaFX Markets',
  '{{broker.support_email}}':'support@arcafx.com',
  '{{broker.support_phone}}':'+1 800 ARCAFX',
  '{{broker.license_no}}':   'SD052',
  '{{txn.type}}':            'Deposit',
  '{{txn.amount}}':          '$5,000.00',
  '{{txn.currency}}':        'USD',
  '{{txn.method}}':          'Wire Transfer',
  '{{txn.date}}':            'January 15, 2024',
  '{{txn.reference}}':       'TXN-10003',
  '{{bonus.amount}}':        '$500',
  '{{margin.level}}':        '31.7%',
  '{{margin.call_level}}':   '50%',
};

const DEFAULT_BODIES: Record<string, string> = {
  'welcome': `Hi {{client.first_name}},\n\nWelcome to {{broker.name}}! Your account has been created and you're ready to start trading.\n\nAccount ID: {{client.account_id}}\nAccount Type: {{client.account_type}}\n\nTo get started, please complete your identity verification to unlock full trading access.\n\nIf you have any questions, our support team is here to help at {{broker.support_email}}.\n\nBest regards,\nThe {{broker.name}} Team`,
  'kyc-approved': `Hi {{client.first_name}},\n\nGreat news! Your identity verification has been successfully completed.\n\nYour {{broker.name}} account is now fully verified and all features are unlocked.\n\nYou can now:\n• Make deposits and withdrawals\n• Trade with your full leverage limit\n• Access all available instruments\n\nHappy trading!\n\nThe {{broker.name}} Team`,
  'margin-call': `MARGIN CALL WARNING\n\nHi {{client.first_name}},\n\nYour account margin level has dropped to {{margin.level}}, which is approaching the margin call threshold of {{margin.call_level}}.\n\nTo avoid automatic position closure, please either:\n• Deposit additional funds\n• Close some open positions\n\nContact support immediately at {{broker.support_email}} or {{broker.support_phone}}.`,
  'deposit-confirm': `Hi {{client.first_name}},\n\nYour {{txn.type}} of {{txn.amount}} has been successfully processed.\n\nTransaction Details:\nType: {{txn.type}}\nAmount: {{txn.amount}}\nMethod: {{txn.method}}\nDate: {{txn.date}}\nReference: {{txn.reference}}\n\nFunds are now available in your trading account.\n\nThank you for trading with {{broker.name}}.`,
};

function applyMergeTags(text: string, data: Record<string, string>): string {
  return Object.entries(data).reduce(
    (acc, [tag, val]) => acc.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), val),
    text,
  );
}

const CAT_BADGE: Record<string, string> = {
  Account: 'badge badge-muted', KYC: 'badge badge-accent', Trading: 'badge badge-warn',
  Finance: 'badge badge-bull', Security: 'badge badge-bear', IB: 'badge badge-purple',
  Compliance: 'badge badge-muted',
};

export default function EmailTemplatesPage() {
  const [selectedId, setSelectedId] = useState('welcome');
  const [subjects, setSubjects] = useState<Record<string, string>>(
    Object.fromEntries(TEMPLATES.map(t => [t.id, t.subject]))
  );
  const [bodies, setBodies] = useState<Record<string, string>>(DEFAULT_BODIES);
  const [showPreview, setShowPreview] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [catFilter, setCatFilter] = useState('All');

  const selected = TEMPLATES.find(t => t.id === selectedId)!;
  const subject = subjects[selectedId] || selected.subject;
  const body = bodies[selectedId] ?? `Hi {{client.first_name}},\n\nThis is the ${selected.label} email.\n\nRegards,\nThe {{broker.name}} Team`;

  const categories = ['All', ...Array.from(new Set(TEMPLATES.map(t => t.category)))];
  const filtered = catFilter === 'All' ? TEMPLATES : TEMPLATES.filter(t => t.category === catFilter);

  const previewSubject = applyMergeTags(subject, SAMPLE_DATA);
  const previewBody = applyMergeTags(body, SAMPLE_DATA);

  const sendTest = () => { setTestSent(true); setTimeout(() => setTestSent(false), 3000); };

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Email Templates</p>
          <p className="module-subtitle">{TEMPLATES.length} templates</p>
        </div>
      </div>

      <div className="p-6 flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
        <div className="grid flex-1 grid-cols-[240px_1fr] gap-4 overflow-hidden">
          {/* Template list */}
          <div className="flex flex-col gap-2 overflow-y-auto">
            <div className="chart-tabs flex-wrap">
              {categories.map(c => (
                <button key={c} className={`chart-tab ${catFilter === c ? 'active' : ''}`}
                  onClick={() => setCatFilter(c)}>
                  {c}
                </button>
              ))}
            </div>
            {filtered.map(t => (
              <button key={t.id}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selectedId === t.id
                    ? 'border-accent bg-accent/5'
                    : 'border-[var(--border)] hover:border-[var(--border-hi)]'
                }`}
                onClick={() => setSelectedId(t.id)}>
                <div className="flex items-start justify-between gap-1 mb-1">
                  <p className="text-[11px] font-medium text-fg1">{t.label}</p>
                  <span className={`shrink-0 text-[9px] ${CAT_BADGE[t.category]}`}>{t.category}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Editor + preview */}
          <div className="flex flex-col gap-3 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold text-fg1 flex-1">{selected.label}</p>
              <button className="btn-ghost btn btn-sm" onClick={() => setShowPreview(p => !p)}>
                {showPreview ? <><EyeOff size={13} /> Edit</> : <><Eye size={13} /> Preview</>}
              </button>
              <button className="btn-primary btn btn-sm" onClick={sendTest} disabled={testSent}>
                <Send size={13} /> {testSent ? 'Sent!' : 'Send Test'}
              </button>
            </div>

            {/* Subject line */}
            <div>
              <label className="kpi-label mb-1 block">Subject</label>
              <input className="input w-full text-[12px]" value={subject}
                onChange={e => setSubjects(s => ({ ...s, [selectedId]: e.target.value }))} />
            </div>

            {showPreview ? (
              /* Live preview panel */
              <div className="flex-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-5">
                <p className="mb-3 border-b pb-3 text-[12px] font-semibold text-gray-800">
                  Subject: {previewSubject}
                </p>
                <pre className="whitespace-pre-wrap font-sans text-[12px] text-gray-700 leading-relaxed">
                  {previewBody}
                </pre>
              </div>
            ) : (
              <div className="flex flex-1 gap-4 overflow-hidden">
                {/* Body editor */}
                <div className="flex flex-1 flex-col">
                  <label className="kpi-label mb-1 block">Body</label>
                  <textarea
                    className="input flex-1 resize-none font-mono text-[11px] leading-relaxed"
                    value={body}
                    onChange={e => setBodies(b => ({ ...b, [selectedId]: e.target.value }))}
                  />
                </div>

                {/* Merge tags reference */}
                <div className="w-52 overflow-y-auto">
                  <p className="kpi-label mb-2">Merge Tags</p>
                  <div className="space-y-3">
                    {MERGE_TAG_GROUPS.map(g => (
                      <div key={g.group}>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-fg3 mb-1">{g.group}</p>
                        <div className="space-y-0.5">
                          {g.tags.map(tag => (
                            <button key={tag}
                              className="w-full rounded px-2 py-1 text-left font-mono text-[9px] text-accent hover:bg-accent/10 transition-colors"
                              onClick={() => setBodies(b => ({ ...b, [selectedId]: (b[selectedId] ?? body) + '\n' + tag }))}>
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
