/**
 * @file components/admin-v2/power/shortcut-cheatsheet.tsx
 * @module admin-v2/power
 * @description Overlay that lists every currently-registered keyboard shortcut, grouped by
 *              `group`. Triggered by `?`. Closes on Esc, click-outside, or `?` again.
 *
 *              Exports:
 *                - V2ShortcutCheatsheet — controlled component (open / onOpenChange).
 *
 *              Side-effects: subscribes to the shortcut registry to refresh on changes.
 *
 *              Read order:
 *                1. Component subscribes to listShortcuts() snapshots.
 *                2. Renders grouped overlay.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { listShortcuts, subscribeShortcuts, type ShortcutSpec } from "./shortcuts-registry"
import { cn } from "@/lib/utils"

interface V2ShortcutCheatsheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function prettifyBinding(binding: string): string {
  return binding
    .replace(/\$mod/g, "⌘")
    .replace(/\bShift\b/g, "⇧")
    .replace(/\bAlt\b/g, "⌥")
    .replace(/\bControl\b/g, "Ctrl")
    .replace(/\+/g, " + ")
    .replace(/\s+/g, " ")
}

function groupShortcuts(specs: ShortcutSpec[]): Record<string, ShortcutSpec[]> {
  const out: Record<string, ShortcutSpec[]> = {}
  for (const s of specs) {
    const g = s.group ?? "Global"
    out[g] ??= []
    out[g].push(s)
  }
  return out
}

export function V2ShortcutCheatsheet({ open, onOpenChange }: V2ShortcutCheatsheetProps) {
  const [snapshot, setSnapshot] = React.useState<ShortcutSpec[]>(listShortcuts())

  React.useEffect(() => {
    return subscribeShortcuts(() => setSnapshot(listShortcuts()))
  }, [])

  if (!open) return null
  const groups = groupShortcuts(snapshot)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/95 shadow-2xl">
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="text-base font-semibold text-zinc-100">Keyboard shortcuts</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-xs text-zinc-400 hover:text-zinc-200"
            aria-label="Close shortcuts overlay"
          >
            Esc
          </button>
        </header>
        <div className="grid max-h-[70vh] gap-6 overflow-y-auto p-5 sm:grid-cols-2">
          {Object.entries(groups).map(([groupName, shortcuts]) => (
            <section key={groupName}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                {groupName}
              </h3>
              <ul className="space-y-1.5">
                {shortcuts.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded px-2 py-1 text-sm",
                      "text-zinc-200 hover:bg-zinc-900/40",
                    )}
                  >
                    <span className="truncate">{s.label}</span>
                    <kbd className="shrink-0 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] font-mono text-zinc-300">
                      {prettifyBinding(s.binding)}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {snapshot.length === 0 ? (
            <div className="col-span-2 text-center text-sm text-zinc-500">
              No shortcuts registered yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
