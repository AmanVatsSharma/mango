"use client"

/**
 * @file market-control-help.tsx
 * @module components/admin-console/market-control
 * @description Plain-English tooltip helper + dictionary for the Market Control admin panel.
 *              Every exotic field in the panel has a one-line explanation here so non-technical
 *              operators understand what each lever actually does. `InfoHint` renders a small
 *              info icon with a tooltip; `FieldHint` returns the string given a label key.
 * @author StockTrade
 * @created 2026-04-16
 */

import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"

/**
 * Dictionary of plain-English explanations keyed by the field label as shown in the UI.
 * Keep each line short and jargon-free — assume the reader is a business operator, not a dev.
 */
export const MARKET_CONTROL_HELP: Record<string, string> = {
  // ── Spread / slippage ──────────────────────────────────────────────────
  "Min":
    "The smallest extra fee we add on top of the real market price when the user trades. In % of price.",
  "Max":
    "The biggest extra fee we add on top of the real market price. We randomly pick a value between Min and Max for every order.",
  "Distribution":
    "How we pick the spread between Min and Max. 'Uniform' = random. 'Weighted worst' = biased toward the Max (gives the house more edge).",
  "× Spread":
    "Multiplier on the spread for this segment/user. 1 = normal. 0.5 = half spread (friendlier). 2 = double spread (harder).",
  "× Slippage":
    "Multiplier on slippage (random price movement at fill). Same idea as × Spread — 1 is normal, higher is harsher.",
  "× Margin":
    "Multiplier on the margin this user must keep. 1 = normal. 2 = needs double margin (safer for the house).",
  "× Asymmetric exit spread":
    "When a scalper closes a position, charge them a wider spread than normal. 1 = same as open, 2 = double.",
  "× Small":
    "Slippage multiplier for small-value trades. Usually kept low so retail traders are happy.",
  "× Medium":
    "Slippage multiplier for medium-value trades.",
  "× Large":
    "Slippage multiplier for large-value trades — bigger orders usually get hit harder.",
  "× spread":
    "During this time window, multiply the base spread by this number. >1 means worse pricing in the window.",
  "× slip":
    "During this time window, multiply slippage by this number. >1 means worse fills.",

  // ── Tilt / bias ────────────────────────────────────────────────────────
  "Tilt bias % (-1..+1)":
    "Pushes the fill price toward one side. +1 = always worst price. 0 = neutral. -1 = always best price. Most shops run between 0 and 0.3.",
  "Tilt bias %":
    "Pushes the fill price toward one side. +1 = always worst. 0 = neutral. -1 = always best.",
  "Vol multiplier":
    "Extra boost to spread/slippage during high-volatility moments. 1 = off. 2 = doubles pain when the market is jumpy.",
  "Bias (bps)":
    "Extra price tilt applied to every fill, measured in basis points (1 bps = 0.01%). 10 bps = move price by 0.1% against the user.",
  "Max total drift %":
    "Hard safety cap — fills can never drift more than this % away from the real LTP, no matter what tilts/spreads say.",
  "Min favorable move %":
    "Before an exit counts as profit, the price must move at least this much in the user's favour. Stops paper-thin scalps.",
  "Min holding (seconds)":
    "Minimum time a user must hold a position before they're allowed to close it without penalty.",
  "Max profit / trade %":
    "If any single trade earns more than this % of margin, anti-scalp kicks in (reject or penalise).",
  "Max profit / day %":
    "If a user's total daily profit exceeds this % of margin, anti-scalp kicks in.",

  // ── Size tiers ─────────────────────────────────────────────────────────
  "Small ≤ ₹":
    "Trades up to this rupee value count as 'Small' and use the × Small multiplier.",
  "Medium ≤ ₹":
    "Trades up to this rupee value count as 'Medium'.",
  "Large ≤ ₹":
    "Trades up to this rupee value count as 'Large'. Anything bigger uses the Large multiplier too.",

  // ── Order behavior ─────────────────────────────────────────────────────
  "Require fresh quote (ms)":
    "Reject the order if our last quote for this symbol is older than this many milliseconds (1000 ms = 1 second). Stops stale-quote exploitation.",
  "Max deviation %":
    "Reject a market order if the price moved more than this % from what the user saw.",
  "Delay min (ms)":
    "Shortest random delay added before a limit order is filled. Makes automated scalping harder.",
  "Delay max (ms)":
    "Longest random delay before a limit fills.",
  "Partial fill prob (0..1)":
    "Chance that a limit order only fills partially. 0 = always full fill. 1 = always partial. 0.2 = 20% chance.",
  "Expire after (min)":
    "A limit order that isn't filled in this many minutes is auto-cancelled.",

  // ── Anti-scalp auto-flag ───────────────────────────────────────────────
  "Trades/min threshold":
    "If a user places more trades per minute than this, they get flagged as a scalper.",
  "Quick round-trips/hr":
    "Round-trips = open+close of the same position. More than this per hour = scalper flag.",
  "Min profitable r/t %":
    "The % of their round-trips that must be profitable for the scalper flag to apply. Stops flagging random flailing.",

  // ── User segment overrides ─────────────────────────────────────────────
  "Priority":
    "When a user belongs to multiple segments, the override with the HIGHEST priority wins. Use big numbers (100, 200, 300) so ordering is obvious.",

  // ── Switches / toggles (by semantic key) ───────────────────────────────
  "antiScalpRelaxed":
    "When ON, this group skips anti-scalp checks (holding time, favourable move, profit caps). Use for VIP users.",
  "forceWorstFill":
    "When ON, every fill for this group is pushed to the worst legal price (max tilt). Hurts the user, benefits the house.",
  "killBuy":
    "Block all BUY orders in this scope. Users see a 'trading disabled' banner with the reason.",
  "killSell":
    "Block all SELL/close orders in this scope.",
  "rejectOnKillSwitch":
    "If ON, orders are rejected with an error when the kill switch is active. If OFF, they queue silently.",
  "rejectOnStaleQuote":
    "If ON, orders are rejected when our quote is older than the 'fresh quote' limit. Protects against latency arbitrage.",
  "rejectOnViolation":
    "If ON, anti-scalp violations reject the trade outright. If OFF, we let it through but penalise the fill price.",
  "antiScalpEnabled":
    "Master switch for all anti-scalping logic. Turn OFF to disable min-hold, profit caps, asymmetric exits everything.",
  "priceTiltEnabled":
    "Master switch for price tilt. OFF = fills use raw synthesised ask/bid with no extra push.",
  "scalperAutoFlagEnabled":
    "When ON, the system watches every user's trading pattern and automatically moves fast scalpers into the 'scalper' group.",

  // ── Tab descriptions ───────────────────────────────────────────────────
  "tabSegments":
    "Per-exchange rules (NSE_EQ, NSE_FO, MCX …). This is where you set spread, slippage, size tiers and time-of-day windows for each market.",
  "tabSymbols":
    "Rules for specific symbols (e.g. RELIANCE, NIFTY). Overrides apply on top of the exchange segment rules.",
  "tabUserSegs":
    "Link the platform's real User Segments (from the sidebar) to spread/slip/margin multipliers. Replaces the old hardcoded VIP/Standard groups.",
  "tabGroups":
    "Legacy hardcoded user groups (VIP/Standard/High-Risk/Scalper). Still works but prefer the U.Segs tab for new setups.",
  "tabOrders":
    "How market and limit orders behave — how fresh the quote must be, fill delays, partial fills, expiry.",
  "tabAntiScalp":
    "Anti-scalping rules: minimum holding time, profit caps, auto-detection of scalpers and what to do with them.",
  "tabTilt":
    "Price-tilt mode — extra bias applied to every fill to move prices slightly against the user.",
  "tabKill":
    "Emergency kill switches per segment or symbol. Disable BUY, SELL or both instantly.",
  "tabPreview":
    "Simulate a trade with the current settings. Useful to sanity-check before saving.",
  "tabHistory":
    "Timeline of every config change — who edited what, when, and the exact before → after diff.",

  // ── KPI tiles ──────────────────────────────────────────────────────────
  "kpiHouseNet":
    "Net profit (or loss) the house has made on trades in this window. Green = making money. Red = customers are winning (leak!).",
  "kpiCustomerNet":
    "Net profit customers earned in this window. If this is positive, the house is losing money on those trades.",
  "kpiEffectiveSpread":
    "The average spread % that was actually charged across all fills (weighted by trade value).",
  "kpiTrades":
    "How many trades happened in this window.",

  // ── Kill switch reason ─────────────────────────────────────────────────
  "killReason":
    "Text shown to users when they try to trade and the kill switch is on. Keep it short and clear — e.g. 'NSE circuit halt'.",
}

/** Returns the plain-English hint for a label/key, or undefined if not found. */
export function marketControlHint(key: string | undefined | null): string | undefined {
  if (!key) return undefined
  return MARKET_CONTROL_HELP[key]
}

/**
 * Small inline info icon with a tooltip showing plain-English help text.
 * Use next to section headers, switch labels, and anywhere a FieldNum isn't available.
 */
export function InfoHint({ text, className = "" }: { text: string | undefined; className?: string }) {
  if (!text) return null
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center text-muted-foreground hover:text-primary cursor-help align-middle ${className}`}
            aria-label="help"
          >
            <Info className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-[11px] leading-snug">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Convenience wrapper that looks up the key in the help dictionary. */
export function HintByKey({ hintKey, className = "" }: { hintKey: string; className?: string }) {
  return <InfoHint text={MARKET_CONTROL_HELP[hintKey]} className={className} />
}
