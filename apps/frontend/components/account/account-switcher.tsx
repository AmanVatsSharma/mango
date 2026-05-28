/**
 * File:        components/account/account-switcher.tsx
 * Module:      Account — Account Type Switcher + Demo Creation
 * Purpose:     Account type switcher dropdown for LIVE/DEMO users, plus a self-serve
 *              demo account creation modal with tier selection. Persists selection
 *              in localStorage and triggers SWR data revalidation on switch.
 *
 * Exports:
 *   - AccountSwitcher — switcher dropdown + create-flow component
 *
 * Depends on:
 *   - next-auth/react        — useSession
 *   - swr                   — useSWRConfig for revalidation
 *   - @/lib/constants/demo-tiers — DEMO_ACCOUNT_TIERS
 *   - @/hooks/use-toast       — toast feedback
 *   - @/components/ui/dialog  — Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
 *
 * Side-effects:
 *   - Reads/writes localStorage key "active_account_id"
 *   - POST /api/account/demo on create
 *   - Calls SWR revalidate on switch or after create
 *
 * Key invariants:
 *   - Shows "Create Demo" button when user has no demoTradingAccountId
 *   - Shows LIVE/DEMO switcher when user has a demo account
 *   - Defaults to LIVE account on first load
 *
 * Read order:
 *   1. AccountSwitcher — main component (two states: create button / switcher)
 *   2. CreateDemoModal — tier selection dialog
 *
 * Author:      Claude
 * Last-updated: 2026-05-14
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useSWRConfig } from "swr"
import { DEMO_ACCOUNT_TIERS } from "@/lib/constants/demo-tiers"
import { toast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BadgeCheck, ChevronDown, Coins, Zap, TrendingUp, X } from "lucide-react"

const LOCAL_STORAGE_KEY = "active_account_id"

// ─── Tier card data with visual icons ─────────────────────────────────────────
const TIER_CONFIG = [
  {
    tier: DEMO_ACCOUNT_TIERS[0],
    icon: Coins,
    gradient: "from-amber-50 to-orange-50",
    border: "border-amber-200",
    ring: "ring-amber-300",
    selectedBg: "bg-amber-50",
    badge: "bg-amber-100 text-amber-700",
    cta: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  {
    tier: DEMO_ACCOUNT_TIERS[1],
    icon: Zap,
    gradient: "from-emerald-50 to-teal-50",
    border: "border-emerald-200",
    ring: "ring-emerald-300",
    selectedBg: "bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-700",
    cta: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
  {
    tier: DEMO_ACCOUNT_TIERS[2],
    icon: TrendingUp,
    gradient: "from-violet-50 to-purple-50",
    border: "border-violet-200",
    ring: "ring-violet-300",
    selectedBg: "bg-violet-50",
    badge: "bg-violet-100 text-violet-700",
    cta: "bg-violet-600 hover:bg-violet-700 text-white",
  },
] as const

// ─── AccountSwitcher ───────────────────────────────────────────────────────────
export function AccountSwitcher() {
  const { data: session, status } = useSession()
  const { mutate } = useSWRConfig()
  const switcherRef = useRef<HTMLDivElement>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedTierIdx, setSelectedTierIdx] = useState(1) // default ₹10L (index 1)
  const [creating, setCreating] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Defer all rendering until session is loaded — avoids hydration mismatch
  // between SSR (no session) and client (session resolved).
  if (status === "loading") return null

  const liveAccountId = (session?.user as any)?.tradingAccountId as string | undefined
  const demoAccountId = (session?.user as any)?.demoTradingAccountId as string | undefined
  const hasDemo = Boolean(demoAccountId)

  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    setActiveId(
      stored && (stored === liveAccountId || stored === demoAccountId)
        ? stored
        : liveAccountId ?? null
    )
  }, [liveAccountId, demoAccountId])

  const handleSwitch = useCallback(
    (newId: string) => {
      localStorage.setItem(LOCAL_STORAGE_KEY, newId)
      setActiveId(newId)
      setSwitcherOpen(false)
      mutate(() => true)
    },
    [mutate]
  )

  // ── Create Demo button (user has no demo yet) ───────────────────────────
  if (!hasDemo) {
    return (
      <>
        <button
          onClick={() => setCreateOpen(true)}
          className="
            group flex items-center gap-2 px-3 py-1.5 rounded-lg
            border border-dashed border-zinc-300
            text-[11px] font-semibold tracking-wide text-zinc-500 uppercase
            hover:border-amber-400 hover:bg-amber-50/60 hover:text-amber-600
            active:scale-95 transition-all duration-200
          "
          aria-label="Create demo account"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 group-hover:bg-amber-500 transition-colors" />
          Create Demo
        </button>

        <CreateDemoModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          selectedTierIdx={selectedTierIdx}
          onSelectTierIdx={setSelectedTierIdx}
          onCreate={async () => {
            const tier = DEMO_ACCOUNT_TIERS[selectedTierIdx]
            setCreating(true)
            try {
              const res = await fetch("/api/account/demo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tier: tier.value }),
              })
              const body = await res.json().catch(() => ({}))
              if (!res.ok) {
                toast({
                  title: res.status === 409 ? "Demo account exists" : "Creation failed",
                  description: body?.error ?? "Please try again.",
                  variant: "destructive",
                })
                return
              }
              toast({
                title: "Demo account ready!",
                description: `Starting balance: ${tier.label}`,
              })
              setCreateOpen(false)
              // Force session revalidation by fetching /api/auth/session before reload.
              // This ensures the JWT is re-decoded with the updated demoTradingAccountId
              // from auth.update() before the page refresh fires.
              fetch("/api/auth/session")
                .then(() => {
                  mutate(() => true)
                  window.location.reload()
                })
                .catch(() => {
                  mutate(() => true)
                  window.location.reload()
                })
            } catch {
              toast({ title: "Network error — try again", variant: "destructive" })
            } finally {
              setCreating(false)
            }
          }}
          creating={creating}
        />
      </>
    )
  }

  // ── Switcher (user has both accounts) ────────────────────────────────────
  if (!activeId) return null

  const isDemo = activeId === demoAccountId

  return (
    <div className="relative" ref={switcherRef}>
      <button
        onClick={() => setSwitcherOpen((o) => !o)}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-bold
          tracking-wide uppercase transition-all duration-200 active:scale-95
          ${isDemo
            ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
            : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }
        `}
        aria-label="Switch account type"
      >
        <span
          className={`w-2 h-2 rounded-full ${isDemo ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}
        />
        {isDemo ? "DEMO" : "LIVE"}
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${switcherOpen ? "rotate-180" : ""}`}
        />
      </button>

      {switcherOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setSwitcherOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 z-50 w-56 bg-white border border-zinc-200 rounded-2xl shadow-2xl py-1.5 overflow-hidden">
            {/* Live option */}
            <button
              onClick={() => handleSwitch(liveAccountId!)}
              className={`
                group w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors
                ${activeId === liveAccountId
                  ? "bg-emerald-50"
                  : "hover:bg-zinc-50"
                }
              `}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <div className="flex-1 text-left">
                <div className={`font-semibold text-xs ${activeId === liveAccountId ? "text-emerald-700" : "text-zinc-700"}`}>
                  Live Account
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">Real funds</div>
              </div>
              {activeId === liveAccountId && (
                <BadgeCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              )}
            </button>

            {/* Divider */}
            <div className="h-px bg-zinc-100 mx-3" />

            {/* Demo option */}
            <button
              onClick={() => handleSwitch(demoAccountId!)}
              className={`
                group w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors
                ${activeId === demoAccountId
                  ? "bg-amber-50"
                  : "hover:bg-zinc-50"
                }
              `}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
              <div className="flex-1 text-left">
                <div className={`font-semibold text-xs ${activeId === demoAccountId ? "text-amber-700" : "text-zinc-700"}`}>
                  Demo Account
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">Virtual funds</div>
              </div>
              {activeId === demoAccountId && (
                <BadgeCheck className="w-4 h-4 text-amber-500 flex-shrink-0" />
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── CreateDemoModal ──────────────────────────────────────────────────────────
function CreateDemoModal({
  open,
  onClose,
  selectedTierIdx,
  onSelectTierIdx,
  onCreate,
  creating,
}: {
  open: boolean
  onClose: () => void
  selectedTierIdx: number
  onSelectTierIdx: (i: number) => void
  onCreate: () => void
  creating: boolean
}) {
  const selectedConfig = TIER_CONFIG[selectedTierIdx]

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 shadow-2xl rounded-2xl">
        {/* Header band */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 px-7 pt-7 pb-6">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-white text-lg font-bold leading-tight">
                Create Demo Account
              </DialogTitle>
              <DialogDescription className="text-zinc-400 text-sm mt-1">
                Practice with virtual funds — no real money involved.
              </DialogDescription>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tier label */}
          <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full text-xs text-zinc-300 font-medium w-fit">
            <span>Select starting balance</span>
          </div>
        </div>

        {/* Tier cards */}
        <div className="px-7 py-5 space-y-3 bg-white">
          {TIER_CONFIG.map((config, i) => {
            const Icon = config.icon
            const isSelected = i === selectedTierIdx
            return (
              <button
                key={config.tier.value}
                onClick={() => onSelectTierIdx(i)}
                className={`
                  group relative w-full flex items-center gap-4 px-4 py-4 rounded-xl border-2
                  transition-all duration-200 text-left
                  ${isSelected
                    ? `${config.border} ${config.selectedBg} ring-2 ${config.ring}`
                    : "border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50"
                  }
                `}
              >
                {/* Icon circle */}
                <div
                  className={`
                    flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                    transition-colors duration-200
                    ${isSelected ? config.selectedBg : "bg-zinc-100 group-hover:bg-zinc-200"}
                  `}
                >
                  <Icon
                    className={`w-5 h-5 ${isSelected ? "text-amber-600" : "text-zinc-400"}`}
                    strokeWidth={1.8}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-zinc-900 text-base leading-tight">
                    {config.tier.label}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    Virtual balance — no real funds
                  </div>
                </div>

                {/* Selection indicator */}
                <div
                  className={`
                    flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center
                    transition-all duration-200
                    ${isSelected
                      ? `${config.border} bg-transparent`
                      : "border-zinc-200"
                    }
                  `}
                >
                  {isSelected && (
                    <div className={`w-2.5 h-2.5 rounded-full ${config.cta.replace("bg-", "bg-").split(" ")[0]}`} />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-3 px-7 pb-7 pt-1 bg-white">
          <button
            onClick={onClose}
            disabled={creating}
            className="flex-1 py-3 px-4 text-sm text-zinc-500 font-medium rounded-xl border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-700 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={creating}
            className={`
              flex-1 py-3 px-4 text-sm font-bold rounded-xl
              transition-all duration-200 disabled:opacity-50
              active:scale-[0.98]
              ${selectedConfig.cta}
            `}
          >
            {creating ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating...
              </span>
            ) : (
              `Create · ${selectedConfig.tier.label}`
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}