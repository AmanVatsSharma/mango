/**
 * @file components/admin-v2/command-centre/risk-flags-strip.tsx
 * @module admin-v2/command-centre
 * @description Sticky strip of risk-flag pills above the trades table. Click a pill to filter
 *              the table to that flag's target (user / symbol / route). Empty when all clear.
 *
 *              Exports: default RiskFlagsStrip — props { onFlagClick }.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { AlertCircle, AlertTriangle, Info } from "lucide-react"
import { useRiskFlags } from "./hooks"
import type { RiskFlag } from "./types"

interface RiskFlagsStripProps {
  onFlagClick?: (flag: RiskFlag) => void
}

const SEV_CLASS: Record<RiskFlag["severity"], string> = {
  info: "border-sky-500/30 bg-sky-500/10 text-[#8AD3FF]",
  warn: "border-amber-500/30 bg-amber-500/10 text-[#FFCB66]",
  critical: "border-rose-500/30 bg-rose-500/10 text-[#FF8AA0]",
}

const SEV_ICON: Record<RiskFlag["severity"], React.ReactNode> = {
  info: <Info className="h-3 w-3" />,
  warn: <AlertTriangle className="h-3 w-3" />,
  critical: <AlertCircle className="h-3 w-3" />,
}

export default function RiskFlagsStrip({ onFlagClick }: RiskFlagsStripProps) {
  const q = useRiskFlags()
  const flags = q.data?.flags ?? []

  if (q.isLoading || flags.length === 0) {
    return null
  }

  return (
    <div className="mb-3 flex items-center gap-2 overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 backdrop-blur">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
        Risk
      </span>
      {flags.map((f, i) => (
        <button
          key={`${f.kind}-${i}`}
          type="button"
          onClick={() => onFlagClick?.(f)}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all hover:brightness-110 ${SEV_CLASS[f.severity]}`}
          title={f.detail ?? f.label}
        >
          {SEV_ICON[f.severity]}
          {f.label}
          {f.count > 0 ? (
            <span className="ml-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] tabular-nums">
              {f.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
