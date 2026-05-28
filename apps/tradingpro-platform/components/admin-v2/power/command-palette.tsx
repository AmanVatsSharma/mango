/**
 * @file components/admin-v2/power/command-palette.tsx
 * @module admin-v2/power
 * @description Cmd+K global command palette for v2. Built on `cmdk`. Exposes navigation
 *              (jump to any v2 route) and a `commands` registry that other v2 surfaces can
 *              extend (e.g., KYC workbench registers "Bulk approve KYC", Client 360 registers
 *              "Freeze user X"). Client search lives in this palette via the existing
 *              `/api/admin/users/search` endpoint.
 *
 *              Exports:
 *                - V2CommandPalette  — controlled component (open / onOpenChange).
 *                - registerCommand   — add a command to the palette registry.
 *                - listCommands      — snapshot of currently registered commands.
 *
 *              Side-effects: client search hits GET /api/admin/users/search?q=…
 *
 *              Key invariants:
 *                - Palette is a single global instance — mounted in the v2 layout.
 *                - Cmd+K toggle is wired via the shortcut registry, not inline here, so the
 *                  cheatsheet stays in sync.
 *                - Client search debounces 200 ms; minimum 2 characters.
 *
 *              Read order:
 *                1. CommandSpec / registerCommand / listCommands — the registry.
 *                2. V2CommandPalette — the renderer + integrated client search.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { Search } from "lucide-react"

const NAV_COMMANDS: NavSpec[] = [
  { id: "nav.home", label: "Home", path: "/admin-v2" },
  { id: "nav.clients", label: "Clients", path: "/admin-v2/clients" },
  { id: "nav.kyc", label: "Compliance / KYC", path: "/admin-v2/kyc" },
  { id: "nav.rms", label: "RM & Teams", path: "/admin-v2/rms" },
  { id: "nav.command-centre", label: "Trade Command Centre", path: "/admin-v2/command-centre" },
  { id: "nav.house", label: "House Book", path: "/admin-v2/house" },
  { id: "nav.house.winners", label: "Winner Mitigation", path: "/admin-v2/house/winners" },
  { id: "nav.house.quotes", label: "Spreads & Quotes", path: "/admin-v2/house/quotes" },
  { id: "nav.bonuses", label: "Bonuses & Promos", path: "/admin-v2/bonuses" },
  { id: "nav.affiliates", label: "Affiliates", path: "/admin-v2/affiliates" },
  { id: "nav.comms", label: "Communications", path: "/admin-v2/comms" },
  { id: "nav.surveillance", label: "Surveillance", path: "/admin-v2/surveillance" },
  { id: "nav.reports", label: "Reports", path: "/admin-v2/reports" },
  { id: "nav.observability", label: "Observability", path: "/admin-v2/observability" },
]

interface NavSpec {
  id: string
  label: string
  path: string
}

export interface CommandSpec {
  id: string
  label: string
  group?: string
  /** Handler. Palette closes after invoke. */
  run: () => void | Promise<void>
  /** Optional keywords for fuzzy search beyond the label. */
  keywords?: string[]
}

const commands = new Map<string, CommandSpec>()
const subs = new Set<() => void>()

export function registerCommand(spec: CommandSpec): () => void {
  commands.set(spec.id, spec)
  subs.forEach((s) => s())
  return () => {
    if (commands.get(spec.id) === spec) {
      commands.delete(spec.id)
      subs.forEach((s) => s())
    }
  }
}

export function listCommands(): CommandSpec[] {
  return Array.from(commands.values())
}

interface ClientHit {
  id: string
  name: string | null
  email: string | null
  clientId: string | null
  phone: string | null
}

interface V2CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function V2CommandPalette({ open, onOpenChange }: V2CommandPaletteProps) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [hits, setHits] = React.useState<ClientHit[]>([])
  const [searching, setSearching] = React.useState(false)
  const [, forceRerender] = React.useReducer((x: number) => x + 1, 0)

  React.useEffect(() => {
    const listener = () => forceRerender()
    subs.add(listener)
    return () => {
      subs.delete(listener)
    }
  }, [])

  // Debounced client search
  React.useEffect(() => {
    if (query.trim().length < 2) {
      setHits([])
      return
    }
    const handle = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`)
        if (!res.ok) throw new Error("search failed")
        const data = (await res.json()) as { users?: ClientHit[] }
        setHits(data.users ?? [])
      } catch {
        setHits([])
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => clearTimeout(handle)
  }, [query])

  // Reset query when closed
  React.useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const close = React.useCallback(() => onOpenChange(false), [onOpenChange])

  function navigate(path: string) {
    router.push(path)
    close()
  }

  async function runCommand(spec: CommandSpec) {
    close()
    await spec.run()
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[18vh] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <Command
        label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/95 shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            autoFocus
            placeholder="Search clients, jump to a page, run a command…"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <kbd className="hidden rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400 sm:block">
            Esc
          </kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-zinc-500">
            {searching ? "Searching…" : "No results."}
          </Command.Empty>

          {hits.length > 0 ? (
            <Command.Group heading="Clients" className="cmdk-group">
              {hits.map((c) => (
                <Command.Item
                  key={c.id}
                  value={`client-${c.id} ${c.name ?? ""} ${c.email ?? ""} ${c.clientId ?? ""}`}
                  onSelect={() => navigate(`/admin-v2/clients/${c.id}`)}
                  className="flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm text-zinc-200 aria-selected:bg-zinc-800/80"
                >
                  <span className="truncate">{c.name ?? "—"}</span>
                  <span className="ml-3 shrink-0 text-xs text-zinc-500">
                    {c.clientId ?? c.email ?? c.phone ?? c.id.slice(0, 8)}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          <Command.Group heading="Navigate" className="cmdk-group">
            {NAV_COMMANDS.map((nav) => (
              <Command.Item
                key={nav.id}
                value={`nav-${nav.id} ${nav.label}`}
                onSelect={() => navigate(nav.path)}
                className="cursor-pointer rounded px-3 py-2 text-sm text-zinc-200 aria-selected:bg-zinc-800/80"
              >
                {nav.label}
                <span className="ml-2 text-xs text-zinc-500">{nav.path}</span>
              </Command.Item>
            ))}
          </Command.Group>

          {listCommands().length > 0 ? (
            <Command.Group heading="Commands" className="cmdk-group">
              {listCommands().map((c) => (
                <Command.Item
                  key={c.id}
                  value={`cmd-${c.id} ${c.label} ${(c.keywords ?? []).join(" ")}`}
                  onSelect={() => runCommand(c)}
                  className="cursor-pointer rounded px-3 py-2 text-sm text-zinc-200 aria-selected:bg-zinc-800/80"
                >
                  {c.label}
                  {c.group ? <span className="ml-2 text-xs text-zinc-500">{c.group}</span> : null}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>
      </Command>
    </div>
  )
}
