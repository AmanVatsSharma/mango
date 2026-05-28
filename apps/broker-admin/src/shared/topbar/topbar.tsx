/**
 * File:        apps/broker-admin/src/shared/topbar/topbar.tsx
 * Module:      broker-admin · Topbar
 * Purpose:     Global top chrome — live clock, system status, theme toggle, notifications bell, ⌘K trigger, user identity
 *
 * Exports:
 *   - BrokerTopbar() — client component
 *
 * Depends on:
 *   - ../../lib/mock-data-context — useBrokerData
 *   - @obsidian/obsidian-ui     — useObsidian (theme toggle)
 *   - lucide-react               — icons
 *
 * Side-effects:
 *   - Runs a 1s interval to keep the UTC clock live
 *   - Theme toggle writes to localStorage via ObsidianProvider.setTheme
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-25
 */

'use client';

import { useEffect, useState } from 'react';
import { Bell, ChevronDown, HelpCircle, LogOut, Moon, Search, Settings, Sun } from 'lucide-react';
import { cn, useObsidian } from '@obsidian/obsidian-ui';
import { useBrokerData } from '../../lib/mock-data-context';

function useClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

interface BrokerTopbarProps {
  onOpenNotifications: () => void;
  onOpenCommandPalette: () => void;
}

export function BrokerTopbar({ onOpenNotifications, onOpenCommandPalette }: BrokerTopbarProps) {
  const time = useClock();
  const { config, unreadCount } = useBrokerData();
  const { resolvedTheme, setTheme } = useObsidian();

  const initials = config.adminUser.name
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4">
      {/* Left — status + clock */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              config.systemStatus === 'operational' ? 'bg-bull animate-pulse' :
              config.systemStatus === 'degraded'    ? 'bg-warn animate-pulse' : 'bg-bear',
            )}
          />
          <span className="font-mono text-[11px] text-fg3">
            {config.systemStatus === 'operational' ? 'All systems operational'
              : config.systemStatus === 'degraded' ? 'Degraded performance'
              : 'System down'}
          </span>
        </span>
        <span className="h-3 w-px bg-[var(--border-md)]" />
        <span className={cn('font-mono text-[11px] text-fg3', !time && 'opacity-0')}>
          {time} UTC
        </span>
      </div>

      {/* Right — search trigger + actions + user */}
      <div className="flex items-center gap-0.5">
        {/* Command palette trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 rounded-r-sm px-2.5 py-1.5 text-fg3 hover:bg-[var(--bg-hover)] hover:text-fg2 transition-colors"
        >
          <Search size={13} strokeWidth={2} />
          <span className="font-ui text-[11px]">Search</span>
          <kbd className="rounded border border-[var(--border-md)] bg-[var(--bg-panel)] px-1 font-mono text-[9px] text-fg3">
            ⌘K
          </kbd>
        </button>

        <span className="mx-1 h-4 w-px bg-[var(--border-md)]" />

        <button className="rounded-r-sm p-2 text-fg3 hover:bg-[var(--bg-hover)] hover:text-fg2 transition-colors" title="Help">
          <HelpCircle size={14} strokeWidth={2} />
        </button>

        {/* Notifications */}
        <button
          onClick={onOpenNotifications}
          className="relative rounded-r-sm p-2 text-fg3 hover:bg-[var(--bg-hover)] hover:text-fg2 transition-colors"
          title="Notifications"
        >
          <Bell size={14} strokeWidth={2} />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-bear px-0.5 font-mono text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <button className="rounded-r-sm p-2 text-fg3 hover:bg-[var(--bg-hover)] hover:text-fg2 transition-colors" title="Settings">
          <Settings size={14} strokeWidth={2} />
        </button>

        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="rounded-r-sm p-2 text-fg3 hover:bg-[var(--bg-hover)] hover:text-fg2 transition-colors"
          title={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {resolvedTheme === 'dark'
            ? <Sun size={14} strokeWidth={2} />
            : <Moon size={14} strokeWidth={2} />
          }
        </button>

        <span className="mx-1 h-4 w-px bg-[var(--border-md)]" />

        {/* User identity */}
        <button className="flex items-center gap-2 rounded-r-sm px-2 py-1.5 text-fg2 hover:bg-[var(--bg-hover)] hover:text-fg1 transition-colors">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 font-display text-[10px] font-bold text-accent">
            {initials}
          </span>
          <span className="hidden font-ui text-[12px] sm:block">{config.adminUser.name}</span>
          <span className="hidden font-mono text-[10px] text-fg3 sm:block">· {config.adminUser.role}</span>
          <ChevronDown size={11} strokeWidth={2} className="text-fg3" />
        </button>

        <span className="mx-1 h-4 w-px bg-[var(--border-md)]" />

        <button className="rounded-r-sm p-2 text-bear hover:bg-bear/10 transition-colors" title="Sign out">
          <LogOut size={14} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
