/**
 * File:        apps/broker-admin/src/shared/notifications/notifications-panel.tsx
 * Module:      broker-admin · Notifications Panel
 * Purpose:     Slide-in notification drawer with tabs for All / Unread / Critical / System
 *
 * Exports:
 *   - NotificationsPanel({ open, onClose }) — client component
 *
 * Depends on:
 *   - ../../lib/mock-data-context — useBrokerData
 *   - lucide-react               — icons
 *
 * Side-effects:
 *   - none
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@obsidian/obsidian-ui';
import { useBrokerData } from '../../lib/mock-data-context';
import type { NotificationType } from '../../lib/types';

type Tab = 'all' | 'unread' | 'critical' | 'system';

const TYPE_DOT: Record<NotificationType, string> = {
  critical: 'bg-bear',
  warning:  'bg-warn',
  info:     'bg-accent',
  system:   'bg-fg3',
};

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ open, onClose }: NotificationsPanelProps) {
  const [tab, setTab] = useState<Tab>('all');
  const { notifications, markNotificationRead, markAllNotificationsRead } = useBrokerData();

  const unreadCount = notifications.filter(n => !n.read).length;

  const filtered = tab === 'all'      ? notifications
    : tab === 'unread'   ? notifications.filter(n => !n.read)
    : tab === 'critical' ? notifications.filter(n => n.type === 'critical')
    : notifications.filter(n => n.type === 'system');

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={onClose} />
      )}

      {/* Panel */}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-float)] transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="font-display text-[11px] font-semibold tracking-[0.1em] text-fg1 uppercase">
            Notifications
          </span>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllNotificationsRead}
                className="font-ui text-[11px] text-accent hover:text-fg1 transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-r-sm p-1 text-fg3 hover:bg-[var(--bg-hover)] hover:text-fg1 transition-colors"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--border)] px-3 py-2">
          {(['all', 'unread', 'critical', 'system'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex items-center gap-1 rounded-r-sm px-2.5 py-1 font-ui text-[11px] transition-colors',
                tab === t
                  ? 'bg-accent/10 text-accent'
                  : 'text-fg3 hover:bg-[var(--bg-hover)] hover:text-fg2',
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'unread' && unreadCount > 0 && (
                <span className="rounded-full bg-bear px-1 font-mono text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-fg3">
              <span className="font-ui text-[13px]">No notifications</span>
              <span className="font-ui text-[11px]">You&apos;re all caught up</span>
            </div>
          ) : (
            filtered.map(n => (
              <button
                key={n.id}
                onClick={() => markNotificationRead(n.id)}
                className={cn(
                  'flex w-full items-start gap-3 border-b border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]',
                  !n.read && 'bg-[var(--bg-panel)]',
                )}
              >
                <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', TYPE_DOT[n.type])} />
                <div className="min-w-0 flex-1">
                  <div className={cn('font-ui text-[12px]', n.read ? 'text-fg2' : 'font-semibold text-fg1')}>
                    {n.title}
                  </div>
                  <div className="mt-0.5 font-ui text-[11px] text-fg3 line-clamp-2">{n.body}</div>
                  <div className="mt-1 font-mono text-[10px] text-fg3">{n.time}</div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] px-4 py-2.5">
          <button className="w-full rounded-r-sm border border-[var(--border)] py-1.5 font-ui text-[11px] text-fg3 hover:bg-[var(--bg-hover)] hover:text-fg2 transition-colors">
            Notification Settings
          </button>
        </div>
      </aside>
    </>
  );
}
