/**
 * @file components/admin-v2/shell/v2-shell.tsx
 * @module admin-v2/shell
 * @description Client-side shell for the v2 admin console. Owns the global shortcut
 *              bindings (Cmd+K palette, ? cheatsheet, Esc close), the density toggle, and
 *              the brand-grade glass header (gradient wordmark + nav strip + Cmd+K trigger).
 *
 *              Exports:
 *                - V2Shell — props { children: ReactNode }
 *
 *              Side-effects: binds Cmd+K, ?, Esc to window via tinykeys; reads/writes density
 *              preference to localStorage on mount.
 *
 *              Key invariants:
 *                - Esc closes whichever overlay is open (palette > cheatsheet); does not propagate.
 *                - $mod+k toggles the palette regardless of cheatsheet state.
 *                - admin-v2.css matches [data-admin-v2-shell] only — no v1 styles touched.
 *                - Density toggle writes data-v2-density on the shell so primitives respond
 *                  via attribute selector (no React re-render needed).
 *
 * @author StockTrade
 * @created 2026-04-26
 * @updated 2026-04-26 — Phase 7: density toggle in header.
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Maximize2, Minimize2, Search, Sparkles, Square } from "lucide-react"
import { V2CommandPalette } from "@/components/admin-v2/power/command-palette"
import { V2ShortcutCheatsheet } from "@/components/admin-v2/power/shortcut-cheatsheet"
import {
  useV2Shortcuts,
  type ShortcutSpec,
} from "@/components/admin-v2/power/shortcuts-registry"
import { useDensity } from "@/components/admin-v2/home/density-toggle"
import { cn } from "@/lib/utils"

const PRIMARY_NAV: { label: string; href: string }[] = [
  { label: "Home", href: "/admin-v2" },
  { label: "Clients", href: "/admin-v2/clients" },
  { label: "Compliance", href: "/admin-v2/kyc" },
  { label: "Sales", href: "/admin-v2/sales" },
  { label: "RM & Teams", href: "/admin-v2/rms" },
  { label: "Command Centre", href: "/admin-v2/command-centre" },
  { label: "House", href: "/admin-v2/house" },
  { label: "Bonuses", href: "/admin-v2/bonuses" },
  { label: "Affiliates", href: "/admin-v2/affiliates" },
  { label: "Comms", href: "/admin-v2/comms" },
  { label: "Funds", href: "/admin-v2/funds" },
  { label: "Withdrawals", href: "/admin-v2/funds/withdrawals" },
  { label: "Reports", href: "/admin-v2/reports" },
  { label: "Surveillance", href: "/admin-v2/surveillance" },
  { label: "Audit", href: "/admin-v2/audit" },
  { label: "Observability", href: "/admin-v2/observability" },
]

export function V2Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [cheatsheetOpen, setCheatsheetOpen] = React.useState(false)
  const { density, setDensity } = useDensity()

  const shortcuts = React.useMemo<ShortcutSpec[]>(
    () => [
      {
        id: "global.command-palette",
        binding: "$mod+k",
        label: "Open command palette",
        group: "Global",
        skipInInputs: false,
        handler: (e) => {
          e.preventDefault()
          setPaletteOpen((v) => !v)
        },
      },
      {
        id: "global.cheatsheet",
        binding: "?",
        label: "Show keyboard shortcuts",
        group: "Global",
        handler: (e) => {
          e.preventDefault()
          setCheatsheetOpen((v) => !v)
        },
      },
      {
        id: "global.escape",
        binding: "Escape",
        label: "Close overlay",
        group: "Global",
        skipInInputs: false,
        handler: () => {
          if (paletteOpen) setPaletteOpen(false)
          else if (cheatsheetOpen) setCheatsheetOpen(false)
        },
      },
    ],
    [paletteOpen, cheatsheetOpen],
  )

  useV2Shortcuts(shortcuts)

  function nextDensity() {
    const order: ("compact" | "default" | "comfortable")[] = ["compact", "default", "comfortable"]
    const idx = order.indexOf(density)
    setDensity(order[(idx + 1) % order.length])
  }

  const DensityIcon =
    density === "compact" ? Minimize2 : density === "comfortable" ? Maximize2 : Square

  return (
    <div data-admin-v2-shell className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[var(--v2-bg-glass)] px-4 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-6">
          <Link href="/admin-v2" className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[radial-gradient(circle_at_30%_30%,#4D7CFE_0%,#8B6CFF_50%,#10E9A0_100%)] shadow-[0_0_20px_-4px_rgba(77,124,254,0.7)]"
            >
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span className="flex items-baseline gap-2 text-sm font-semibold">
              <span className="v2-text-grad-primary">StockTrade</span>
              <span className="v2-pill v2-pill-info text-[9px]">Admin v2</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {PRIMARY_NAV.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/admin-v2" && pathname?.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-white/[0.06] text-[var(--v2-text)]"
                      : "text-[var(--v2-text-mute)] hover:bg-white/[0.04] hover:text-[var(--v2-text)]",
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="group flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-[var(--v2-text-mute)] transition-all hover:border-[var(--v2-border-accent)] hover:bg-white/[0.06] hover:text-[var(--v2-text)]"
              aria-label="Open command palette (⌘K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search clients, run commands…</span>
              <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-[var(--v2-text-mute)] group-hover:border-white/20">
                ⌘ K
              </kbd>
            </button>
            <button
              type="button"
              onClick={nextDensity}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-[var(--v2-text-mute)] transition-colors hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)]"
              aria-label={`Density: ${density}. Click to cycle.`}
              title={`Density: ${density}. Click to cycle.`}
            >
              <DensityIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative">{children}</main>

      <V2CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <V2ShortcutCheatsheet open={cheatsheetOpen} onOpenChange={setCheatsheetOpen} />
    </div>
  )
}
