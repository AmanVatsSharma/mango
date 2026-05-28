/**
 * File:        apps/broker-admin/src/app/(admin)/layout.tsx
 * Module:      broker-admin · Admin Group Layout
 * Purpose:     Shell wrapper for all (admin) routes — sidebar + topbar + main scroll area.
 *              Wraps the shell in AuthGuard to redirect unauthenticated users to /login.
 *
 * Exports:
 *   - AdminLayout() — layout component for the (admin) route group
 *
 * Depends on:
 *   - ../../shared/sidebar/sidebar         — BrokerSidebar
 *   - ../../shared/topbar/topbar           — BrokerTopbar
 *   - ../../shared/command-palette/...    — CommandPalette
 *   - ../../shared/notifications/...     — NotificationsPanel
 *   - ../../lib/auth/auth-guard           — AuthGuard
 *
 * Key invariants:
 *   - 'use client' — manages open/close state for palette + notifications
 *   - ⌘K global hotkey registered here (single listener for entire admin shell)
 *   - AuthGuard returns null until hydration then redirects unauthenticated users
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { BrokerSidebar } from '../../shared/sidebar/sidebar';
import { BrokerTopbar } from '../../shared/topbar/topbar';
import { CommandPalette } from '../../shared/command-palette/command-palette';
import { NotificationsPanel } from '../../shared/notifications/notifications-panel';
import { AuthGuard } from '../../lib/auth/auth-guard';
import { SetupGuard } from '../../lib/auth/setup-guard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const openCmd   = useCallback(() => setCmdOpen(true),  []);
  const closeCmd  = useCallback(() => setCmdOpen(false), []);
  const openNotif  = useCallback(() => setNotifOpen(true),  []);
  const closeNotif = useCallback(() => setNotifOpen(false), []);

  // Global ⌘K / Ctrl+K hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <AuthGuard>
      <SetupGuard>
        <div className="flex h-screen overflow-hidden bg-[var(--bg-base)]">
          <BrokerSidebar />

          <div className="flex flex-1 flex-col overflow-hidden">
            <BrokerTopbar
              onOpenCommandPalette={openCmd}
              onOpenNotifications={openNotif}
            />
            <main className="flex-1 overflow-y-auto bg-[var(--bg-base)]">
              {children}
            </main>
          </div>

          <CommandPalette open={cmdOpen} onClose={closeCmd} />
          <NotificationsPanel open={notifOpen} onClose={closeNotif} />
        </div>
      </SetupGuard>
    </AuthGuard>
  );
}
