/**
 * @file components/admin-v2/power/shortcuts-registry.ts
 * @module admin-v2/power
 * @description Global keyboard-shortcut registry for the v2 admin shell. Modules register
 *              their shortcuts at mount; the cheatsheet (`?`) reads from this registry to
 *              render an always-current overlay; `useV2Shortcuts` binds them via tinykeys.
 *
 *              Exports:
 *                - registerShortcut(spec)        — add a shortcut (returns an unregister fn).
 *                - listShortcuts()               — snapshot of currently registered shortcuts.
 *                - subscribeShortcuts(listener)  — observe changes (used by the cheatsheet).
 *                - useV2Shortcuts(specs)         — React hook: register + bind at mount, unbind at unmount.
 *
 *              Side-effects: tinykeys binds DOM listeners on `window` while the hook is mounted.
 *
 *              Key invariants:
 *                - Each shortcut is identified by its `id` — re-registering the same id replaces it.
 *                - Disallowed inside `<input>` / `<textarea>` / contenteditable — to be enforced by
 *                  the hook (handlers receive a guard helper).
 *                - All bindings use the tinykeys grammar (e.g., "$mod+k", "g k", "?").
 *
 *              Read order:
 *                1. ShortcutSpec — the shape.
 *                2. registerShortcut + listShortcuts + subscribeShortcuts — the store.
 *                3. useV2Shortcuts — the React-facing hook.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { tinykeys } from "tinykeys"

export interface ShortcutSpec {
  /** Stable id (e.g., "global.cmd-k", "kyc.bulk-approve"). Re-registering replaces. */
  id: string
  /** tinykeys grammar (e.g., "$mod+k", "?", "g k"). */
  binding: string
  /** Human-readable label shown in the cheatsheet. */
  label: string
  /** Group name in the cheatsheet (e.g., "Global", "KYC", "Clients"). */
  group?: string
  /** Handler. Receives the original KeyboardEvent. */
  handler: (e: KeyboardEvent) => void
  /** Skip handler when typing in inputs / textareas. Default true. */
  skipInInputs?: boolean
}

const store = new Map<string, ShortcutSpec>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

export function registerShortcut(spec: ShortcutSpec): () => void {
  store.set(spec.id, spec)
  notify()
  return () => {
    if (store.get(spec.id) === spec) {
      store.delete(spec.id)
      notify()
    }
  }
}

export function listShortcuts(): ShortcutSpec[] {
  return Array.from(store.values())
}

export function subscribeShortcuts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function isTypingInForm(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

/**
 * Register + bind shortcuts for the lifetime of a component. Re-renders that change `specs`
 * tear down the old bindings and re-bind the new ones.
 */
export function useV2Shortcuts(specs: ShortcutSpec[]): void {
  React.useEffect(() => {
    const unregisters = specs.map((s) => registerShortcut(s))

    const bindings: Record<string, (e: KeyboardEvent) => void> = {}
    for (const s of specs) {
      bindings[s.binding] = (e) => {
        if ((s.skipInInputs ?? true) && isTypingInForm(e.target)) return
        s.handler(e)
      }
    }
    const unbind = tinykeys(window, bindings)

    return () => {
      unbind()
      unregisters.forEach((u) => u())
    }
  }, [specs])
}
