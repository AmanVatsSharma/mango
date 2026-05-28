/**
 * @file components/admin-v2/spread/slippage-simulator.tsx
 * @module admin-v2/spread
 * @description "What if I tighten this spread by 2 paise — what's the revenue impact?"
 *              Renders inputs (symbol, segment, tier, mid, daily volume, override knobs)
 *              and shows baseline vs override bid/ask + Δ revenue per lot + projected daily impact.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Calculator, FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError, formatInr } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import type { SpreadSimulateEnvelope, SimulationResult } from "./types"

interface SlippageSimulatorProps {
  /** Optional pre-fill from a row click in the spread list. */
  prefill?: {
    instrument?: string | null
    segment?: string | null
    clientTier?: string | null
    bidMarkupBps?: number
    askMarkupBps?: number
  }
}

interface FormState {
  symbol: string
  segment: string
  clientTier: string
  mid: string
  averageDailyVolume: string
  overrideBidBps: string
  overrideAskBps: string
  perClientMultiplier: string
}

function defaultsFromPrefill(p: SlippageSimulatorProps["prefill"]): FormState {
  return {
    symbol: p?.instrument ?? "RELIANCE",
    segment: p?.segment ?? "NSE",
    clientTier: p?.clientTier ?? "SILVER",
    mid: "1250.00",
    averageDailyVolume: "1000",
    overrideBidBps: p?.bidMarkupBps != null ? String(p.bidMarkupBps) : "",
    overrideAskBps: p?.askMarkupBps != null ? String(p.askMarkupBps) : "",
    perClientMultiplier: "",
  }
}

export function SlippageSimulator({ prefill }: SlippageSimulatorProps) {
  const [state, setState] = React.useState<FormState>(() => defaultsFromPrefill(prefill))
  const [result, setResult] = React.useState<SimulationResult | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (prefill) setState(defaultsFromPrefill(prefill))
  }, [prefill?.instrument, prefill?.segment, prefill?.clientTier]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRun() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/spread/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: state.symbol.trim(),
          segment: state.segment.trim() || null,
          clientTier: state.clientTier.trim() || null,
          mid: Number(state.mid),
          averageDailyVolume: state.averageDailyVolume ? Number(state.averageDailyVolume) : undefined,
          overrideBidBps: state.overrideBidBps !== "" ? Number(state.overrideBidBps) : undefined,
          overrideAskBps: state.overrideAskBps !== "" ? Number(state.overrideAskBps) : undefined,
          perClientMultiplier:
            state.perClientMultiplier !== "" ? Number(state.perClientMultiplier) : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new ApiError(body?.message || `Simulate failed (${res.status})`, res.status)
      }
      const body = (await res.json()) as SpreadSimulateEnvelope
      setResult(body.result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulate failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="v2-card p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-[var(--v2-cobalt-soft)] text-[#9DB6FF]">
            <FlaskConical className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[var(--v2-text)]">Slippage simulator</h3>
            <p className="text-[11px] text-[var(--v2-text-mute)]">
              Project Δ revenue per lot + daily impact at any markup
            </p>
          </div>
        </div>
        <Button onClick={handleRun} disabled={busy} size="sm" className="v2-btn-cta">
          <Calculator className="mr-1.5 h-3.5 w-3.5" />
          {busy ? "Running…" : "Run simulation"}
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField id="sim-sym" label="Symbol" mono>
          <Input
            id="sim-sym"
            value={state.symbol}
            onChange={(e) => setState((s) => ({ ...s, symbol: e.target.value }))}
            className="border-white/[0.08] bg-white/[0.02] font-mono text-xs"
          />
        </FormField>
        <FormField id="sim-seg" label="Segment" mono>
          <Input
            id="sim-seg"
            value={state.segment}
            onChange={(e) => setState((s) => ({ ...s, segment: e.target.value }))}
            className="border-white/[0.08] bg-white/[0.02] font-mono text-xs"
          />
        </FormField>
        <FormField id="sim-tier" label="Client tier" mono>
          <Input
            id="sim-tier"
            value={state.clientTier}
            onChange={(e) => setState((s) => ({ ...s, clientTier: e.target.value }))}
            className="border-white/[0.08] bg-white/[0.02] font-mono text-xs"
          />
        </FormField>
        <FormField id="sim-mid" label="Mid (₹)">
          <Input
            id="sim-mid"
            type="number"
            step="0.05"
            value={state.mid}
            onChange={(e) => setState((s) => ({ ...s, mid: e.target.value }))}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </FormField>
        <FormField id="sim-vol" label="Daily volume (lots)">
          <Input
            id="sim-vol"
            type="number"
            step="100"
            value={state.averageDailyVolume}
            onChange={(e) => setState((s) => ({ ...s, averageDailyVolume: e.target.value }))}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </FormField>
        <FormField id="sim-bid" label="Override bid (bps)">
          <Input
            id="sim-bid"
            type="number"
            step="0.5"
            placeholder="baseline"
            value={state.overrideBidBps}
            onChange={(e) => setState((s) => ({ ...s, overrideBidBps: e.target.value }))}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </FormField>
        <FormField id="sim-ask" label="Override ask (bps)">
          <Input
            id="sim-ask"
            type="number"
            step="0.5"
            placeholder="baseline"
            value={state.overrideAskBps}
            onChange={(e) => setState((s) => ({ ...s, overrideAskBps: e.target.value }))}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </FormField>
        <FormField id="sim-mult" label="Per-client × (winner)">
          <Input
            id="sim-mult"
            type="number"
            step="0.1"
            placeholder="1.0"
            value={state.perClientMultiplier}
            onChange={(e) => setState((s) => ({ ...s, perClientMultiplier: e.target.value }))}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </FormField>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-[rgba(255,77,107,0.3)] bg-[var(--v2-loss-soft)] p-2.5 text-xs text-[var(--v2-loss)]">
          {error}
        </div>
      ) : null}

      {result ? <ResultPanel result={result} /> : null}
    </div>
  )
}

function FormField({
  id,
  label,
  mono,
  children,
}: {
  id: string
  label: string
  mono?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <Label
        htmlFor={id}
        className={cn(
          "text-xs text-[var(--v2-text-mute)]",
          mono && "uppercase tracking-[0.06em]",
        )}
      >
        {label}
      </Label>
      {children}
    </div>
  )
}

function ResultPanel({ result }: { result: SimulationResult }) {
  const positive = result.deltaRevenuePerLot >= 0
  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-text-faint)]">
          Baseline
        </h4>
        <PriceRow label="Bid" value={result.baselineBidPrice} />
        <PriceRow label="Ask" value={result.baselineAskPrice} />
        <div className="mt-2 text-[10px] text-[var(--v2-text-mute)]">
          {result.baseline.bidMarkupBps.toFixed(2)} / {result.baseline.askMarkupBps.toFixed(2)} bps
          {result.baseline.perClientApplied
            ? ` · ${result.baseline.effectiveMultiplier.toFixed(2)}× client`
            : ""}
        </div>
      </div>
      <div className="rounded-xl border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] p-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9DB6FF]">
          Override
        </h4>
        <PriceRow label="Bid" value={result.overrideBidPrice} />
        <PriceRow label="Ask" value={result.overrideAskPrice} />
        <div className="mt-2 text-[10px] text-[var(--v2-text-mute)]">
          {result.override.bidMarkupBps.toFixed(2)} / {result.override.askMarkupBps.toFixed(2)} bps
          {result.override.perClientApplied
            ? ` · ${result.override.effectiveMultiplier.toFixed(2)}× client`
            : ""}
        </div>
      </div>
      <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            Δ revenue per lot
          </div>
          <div
            className={cn(
              "v2-num-display mt-1 text-2xl font-bold",
              positive ? "text-[var(--v2-gain)]" : "text-[var(--v2-loss)]",
            )}
          >
            {positive ? "+" : ""}
            {formatInr(result.deltaRevenuePerLot)}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            Projected daily impact
          </div>
          <div
            className={cn(
              "v2-num-display mt-1 text-2xl font-bold",
              result.projectedDailyImpact !== null && result.projectedDailyImpact >= 0
                ? "text-[var(--v2-gain)]"
                : result.projectedDailyImpact !== null
                  ? "text-[var(--v2-loss)]"
                  : "text-[var(--v2-text-mute)]",
            )}
          >
            {result.projectedDailyImpact !== null
              ? `${result.projectedDailyImpact >= 0 ? "+" : ""}${formatInr(result.projectedDailyImpact)}`
              : "—"}
          </div>
        </div>
      </div>
    </div>
  )
}

function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-2 flex items-baseline justify-between text-sm">
      <span className="text-[var(--v2-text-mute)]">{label}</span>
      <span className="v2-num-display text-base font-semibold text-[var(--v2-text)]">
        ₹{value.toFixed(4)}
      </span>
    </div>
  )
}
