/**
 * File:        app/(main)/test-websocket/page.tsx
 * Module:      Test · WebSocket Market Data Diagnostics
 * Purpose:     Operator-facing diagnostic page for the SAME market-data layer the
 *              dashboard uses. Lets you (a) override the gateway URL + API key at
 *              runtime, (b) watch every observable socket event (connected /
 *              disconnected / subscription_confirmed / error / init_error) with
 *              timestamps and payloads, (c) inspect per-token tick rate / silence /
 *              LTP / errors, and (d) drive subscribe / unsubscribe / reconnect with
 *              a single click. When the dashboard is broken, this page reproduces
 *              the failure with every diagnostic surfaced.
 *
 * Exports:
 *   - default WebSocketTestPage — Next.js page component
 *
 * Depends on:
 *   - @/lib/market-data/providers/WebSocketMarketDataProvider — provider, hooks,
 *     and the new urlOverride / apiKeyOverride / onTransportEvent props
 *   - @/lib/market-data/hooks/useWebSocketMarketData          — WSTransportEvent type
 *   - next-auth/react useSession                              — userId for the provider
 *
 * Side-effects:
 *   - One Socket.IO connection per provider mount (closed on unmount). Re-mounts
 *     when the operator clicks "Apply" with new URL / API key (React `key` change).
 *
 * Key invariants:
 *   - This page MUST go through WebSocketMarketDataProvider + useMarketDataLive /
 *     useMarketDataStable. Reaching into useWebSocketMarketData directly creates a
 *     separate service instance and the test would not exercise the dashboard path.
 *   - Canonical index tokens are SACRED:
 *       Nifty 50 → 26571
 *       Bank Nifty → 26575
 *       Test Page Bank Nifty → 11536
 *     Do NOT "synchronize" these with other mappers. Architectural reference.
 *   - Connection URL + namespace + handshake-path resolution is delegated to the
 *     provider chain. Bare hosts default the namespace to /market-data. The
 *     override accepts either bare host (https://x.example.com) or a full URL
 *     including a custom namespace (https://x.example.com/foo).
 *
 * Read order:
 *   1. CANONICAL_TOKENS         — sacred token list
 *   2. WebSocketTestPage        — top-level wrapper. Owns URL/key state AND the
 *                                 persistent diagnostic state (eventLog,
 *                                 stateHistory). Mounts the provider with `key={…}`
 *                                 ONLY on the provider — so an Apply remount does
 *                                 NOT wipe the log; you see old + new socket events
 *                                 in one continuous timeline.
 *   3. TestPageInner            — diagnostic UI (uses dashboard hooks). Stateless
 *                                 with respect to event log; receives it as a prop.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Added URL + API key override inputs that re-mount the provider on Apply.
 *   - Added Raw Event Log fed by the new onTransportEvent provider prop —
 *     surfaces connected / disconnected / subscriptionConfirmed / error /
 *     initError verbatim with payload JSON.
 *   - Hoisted eventLog + stateHistory ABOVE the keyed provider so they survive
 *     the Apply remount (operator can compare old socket's last events to the
 *     new socket's first events on the same screen). Connection timeline is now
 *     derived from the event log; the live "connecting" transient is shown via
 *     ConnectionBadge but not in the timeline (no socket-level event for it).
 *   - Added per-token diagnostic table with tick count, last-tick age, silence
 *     watchdog (yellow ≥10s, red ≥30s), LTP, error code, and raw quote toggle.
 */

"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSession } from "next-auth/react"
import {
  WebSocketMarketDataProvider,
  useMarketDataLive,
  useMarketDataStable,
} from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import type { SubscriptionMode } from "@/lib/market-data/providers/types"
import type { WSTransportEvent } from "@/lib/market-data/hooks/useWebSocketMarketData"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Wifi,
  WifiOff,
  Send,
  Trash2,
  Activity,
  CheckCircle,
  Loader2,
  AlertCircle,
  Zap,
  Copy,
  RefreshCw,
  Settings,
  Eye,
  EyeOff,
} from "lucide-react"

// =====================================================================
// CANONICAL TOKENS — sacred per architectural reference. Do NOT modify
// these values during any "synchronize tokens with mapper" cleanup.
// =====================================================================
const CANONICAL_TOKENS: Array<{ token: number; name: string; note?: string }> = [
  { token: 26571, name: "Nifty 50", note: "Index header tick" },
  { token: 26575, name: "Bank Nifty", note: "Index header tick" },
  { token: 11536, name: "Test Page Bank Nifty", note: "Test-page-specific token" },
  { token: 2881, name: "Reliance" },
  { token: 2953217, name: "TCS" },
  { token: 341249, name: "HDFC Bank" },
]

const SUBSCRIPTION_MODES: SubscriptionMode[] = ["ltp", "ohlcv", "full"]
const SILENCE_WARN_MS = 10_000
const SILENCE_ALERT_MS = 30_000
const MAX_EVENT_LOG = 300
const MAX_STATE_HISTORY = 60

// =====================================================================
// TOP-LEVEL WRAPPER — owns the override state AND the diagnostic event
// log. Putting `key` on the provider (NOT this component) means React
// remounts only the provider sub-tree on Apply, while eventLog +
// stateHistory state up here survive — letting the operator watch the
// OLD socket's "disconnected" event sit next to the NEW socket's
// "connected" event in one continuous log. Without this hoist, the log
// wipes on every Apply, defeating its purpose.
// =====================================================================
export default function WebSocketTestPage() {
  const session = useSession()
  const userId = (session.data?.user as { id?: string } | undefined)?.id ?? "test-page-anon"

  const envUrl = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_URL ?? ""
  const envApiKey = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY ?? ""
  const [draftUrl, setDraftUrl] = useState<string>(envUrl)
  const [draftApiKey, setDraftApiKey] = useState<string>(envApiKey)
  const [appliedUrl, setAppliedUrl] = useState<string>(envUrl)
  const [appliedApiKey, setAppliedApiKey] = useState<string>(envApiKey)

  // Persistent diagnostic state — survives provider remount on Apply.
  const [eventLog, setEventLog] = useState<Array<WSTransportEvent & { id: number }>>([])
  const eventCounterRef = useRef(0)
  const onTransportEvent = useCallback((evt: WSTransportEvent) => {
    eventCounterRef.current += 1
    const id = eventCounterRef.current
    setEventLog((prev) => [{ ...evt, id }, ...prev].slice(0, MAX_EVENT_LOG))
  }, [])
  const clearEventLog = useCallback(() => setEventLog([]), [])

  // Connection-state timeline derived from the same event log so it ALSO
  // survives the Apply remount. Trade-off: 'connecting' transients (a React-
  // only state in useWebSocketMarketData with no corresponding socket event)
  // do NOT appear here — only socket-confirmed transitions. The current
  // 'connecting' state is still visible via the live ConnectionBadge.
  const stateHistory = useMemo<Array<{ t: number; state: string }>>(() => {
    const out: Array<{ t: number; state: string }> = []
    for (const evt of eventLog) {
      if (evt.type === "connected") out.push({ t: evt.timestamp, state: "connected" })
      else if (evt.type === "disconnected") out.push({ t: evt.timestamp, state: "disconnected" })
      else if (evt.type === "error" || evt.type === "initError")
        out.push({ t: evt.timestamp, state: "error" })
    }
    return out.slice(0, MAX_STATE_HISTORY)
  }, [eventLog])

  const onApply = useCallback(() => {
    setAppliedUrl(draftUrl.trim())
    setAppliedApiKey(draftApiKey.trim())
  }, [draftUrl, draftApiKey])

  const onResetToEnv = useCallback(() => {
    setDraftUrl(envUrl)
    setDraftApiKey(envApiKey)
    setAppliedUrl(envUrl)
    setAppliedApiKey(envApiKey)
  }, [envUrl, envApiKey])

  if (session.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const draftDirty = draftUrl !== appliedUrl || draftApiKey !== appliedApiKey
  // Key on the provider only — eventLog + stateHistory live above and survive.
  const remountKey = `${appliedUrl}|${appliedApiKey}`

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <OverrideControls
          draftUrl={draftUrl}
          draftApiKey={draftApiKey}
          appliedUrl={appliedUrl}
          appliedApiKey={appliedApiKey}
          envUrl={envUrl}
          envApiKey={envApiKey}
          dirty={draftDirty}
          onUrlChange={setDraftUrl}
          onApiKeyChange={setDraftApiKey}
          onApply={onApply}
          onResetToEnv={onResetToEnv}
        />
        <WebSocketMarketDataProvider
          key={remountKey}
          userId={userId}
          enableWebSocket
          urlOverride={appliedUrl || undefined}
          apiKeyOverride={appliedApiKey || undefined}
          onTransportEvent={onTransportEvent}
        >
          <TestPageInner
            userId={userId}
            eventLog={eventLog}
            stateHistory={stateHistory}
            onClearEventLog={clearEventLog}
            appliedUrl={appliedUrl}
            appliedApiKey={appliedApiKey}
          />
        </WebSocketMarketDataProvider>
      </div>
    </div>
  )
}

// =====================================================================
// OVERRIDE CONTROLS — URL + API key inputs and Apply / Reset buttons
// =====================================================================
function OverrideControls({
  draftUrl,
  draftApiKey,
  appliedUrl,
  appliedApiKey,
  envUrl,
  envApiKey,
  dirty,
  onUrlChange,
  onApiKeyChange,
  onApply,
  onResetToEnv,
}: {
  draftUrl: string
  draftApiKey: string
  appliedUrl: string
  appliedApiKey: string
  envUrl: string
  envApiKey: string
  dirty: boolean
  onUrlChange: (v: string) => void
  onApiKeyChange: (v: string) => void
  onApply: () => void
  onResetToEnv: () => void
}) {
  const [showKey, setShowKey] = useState(false)
  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="w-4 h-4" /> Manual Gateway Override
        </CardTitle>
        <CardDescription>
          Type a URL + API key and click <b>Apply</b> — the entire provider re-mounts
          with these values (a fresh Socket.IO instance is created). Reset clears
          the override and falls back to <code className="px-1 rounded bg-muted text-xs">NEXT_PUBLIC_LIVE_MARKET_WS_*</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              WebSocket URL
            </label>
            <Input
              value={draftUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://marketdata.example.com or https://host/custom-namespace"
              className="font-mono text-xs"
            />
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Bare host → namespace defaults to <code className="px-1 rounded bg-muted">/market-data</code>.
              Path on the URL becomes the Socket.IO namespace.
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              API Key
            </label>
            <div className="flex gap-1">
              <Input
                value={draftApiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="api key — sent as ?api_key=…"
                type={showKey ? "text" : "password"}
                className="font-mono text-xs flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setShowKey((v) => !v)}
                className="flex-shrink-0"
                title={showKey ? "Hide" : "Show"}
              >
                {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center pt-1">
          <Button onClick={onApply} disabled={!dirty} size="sm" className="gap-1">
            <RefreshCw className="w-3 h-3" /> Apply &amp; Reconnect
          </Button>
          <Button
            onClick={onResetToEnv}
            disabled={!envUrl && !envApiKey && !appliedUrl && !appliedApiKey}
            size="sm"
            variant="outline"
            className="gap-1"
          >
            Reset to env
          </Button>
          {dirty && (
            <Badge variant="outline" className="text-amber-700 border-amber-300">
              unsaved — click Apply to reconnect
            </Badge>
          )}
          <div className="ml-auto text-[11px] font-mono text-muted-foreground">
            applied: {appliedUrl || "(empty — using env / dev fallback)"}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =====================================================================
// INNER UI — uses the dashboard hooks, hosts the diagnostic surfaces
// =====================================================================
function TestPageInner({
  userId,
  eventLog,
  stateHistory,
  onClearEventLog,
  appliedUrl,
  appliedApiKey,
}: {
  userId: string
  eventLog: Array<WSTransportEvent & { id: number }>
  stateHistory: Array<{ t: number; state: string }>
  onClearEventLog: () => void
  appliedUrl: string
  appliedApiKey: string
}) {
  const live = useMarketDataLive()
  const stable = useMarketDataStable()

  const [tokenInput, setTokenInput] = useState("26571")
  const [mode, setMode] = useState<SubscriptionMode>("ltp")
  const [subscribed, setSubscribed] = useState<Set<number>>(new Set())
  const [tickCounts, setTickCounts] = useState<Record<number, number>>({})
  const [firstTickAt, setFirstTickAt] = useState<Record<number, number>>({})
  const [lastTickAt, setLastTickAt] = useState<Record<number, number>>({})
  const [tickClock, setTickClock] = useState<number>(Date.now())
  const lastQuotesRef = useRef<Record<string, unknown>>({})

  // 1Hz redraw clock so silence ages stay accurate without re-rendering on every tick
  useEffect(() => {
    const id = window.setInterval(() => setTickClock(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Derive tick counts + first/last-tick timestamps from live quotes
  useEffect(() => {
    const quotes = live.quotes || {}
    let nextTickCounts = tickCounts
    let nextFirstTickAt = firstTickAt
    let nextLastTickAt = lastTickAt
    let mutated = false
    for (const [key, quote] of Object.entries(quotes)) {
      if (lastQuotesRef.current[key] !== quote) {
        const tokenNum = Number(key)
        if (!Number.isFinite(tokenNum)) continue
        if (!nextFirstTickAt[tokenNum]) {
          nextFirstTickAt = { ...nextFirstTickAt, [tokenNum]: Date.now() }
          mutated = true
        }
        nextTickCounts = {
          ...nextTickCounts,
          [tokenNum]: (nextTickCounts[tokenNum] ?? 0) + 1,
        }
        nextLastTickAt = { ...nextLastTickAt, [tokenNum]: Date.now() }
        mutated = true
        lastQuotesRef.current[key] = quote
      }
    }
    if (mutated) {
      setTickCounts(nextTickCounts)
      setFirstTickAt(nextFirstTickAt)
      setLastTickAt(nextLastTickAt)
    }
  }, [live.quotes, tickCounts, firstTickAt, lastTickAt])

  const handleSubscribe = useCallback(() => {
    const token = Number(tokenInput.trim())
    if (!Number.isFinite(token) || token <= 0) {
      console.error(`[test-ws] Invalid token: "${tokenInput}"`)
      return
    }
    if (subscribed.has(token)) {
      console.warn(`[test-ws] Token ${token} already subscribed (mode=${mode})`)
      return
    }
    stable.subscribe([token], mode)
    setSubscribed((prev) => new Set(prev).add(token))
  }, [tokenInput, mode, subscribed, stable])

  const handleUnsubscribe = useCallback(
    (token: number) => {
      stable.unsubscribe([token], mode)
      setSubscribed((prev) => {
        const next = new Set(prev)
        next.delete(token)
        return next
      })
    },
    [stable, mode],
  )

  const handleSubscribeAllCanonical = useCallback(() => {
    const tokens = CANONICAL_TOKENS.map((t) => t.token).filter((t) => !subscribed.has(t))
    if (tokens.length === 0) return
    stable.subscribe(tokens, mode)
    setSubscribed((prev) => {
      const next = new Set(prev)
      tokens.forEach((t) => next.add(t))
      return next
    })
  }, [stable, mode, subscribed])

  const handleClearAll = useCallback(() => {
    const tokens = Array.from(subscribed)
    if (tokens.length === 0) return
    stable.unsubscribe(tokens, mode)
    setSubscribed(new Set())
    setTickCounts({})
    setFirstTickAt({})
    setLastTickAt({})
    lastQuotesRef.current = {}
  }, [subscribed, stable, mode])

  const handleReconnect = useCallback(() => {
    stable.reconnect()
  }, [stable])

  const subscribedRows = useMemo(() => {
    const now = tickClock
    return Array.from(subscribed)
      .sort((a, b) => a - b)
      .map((token) => {
        // Find the quote under any of the three keys (instrumentToken, uirId, providerToken)
        // — emitter writes through all three; bare-token lookup catches the common case.
        const quote = live.quotes?.[String(token)]
        const ltp =
          quote?.last_trade_price ??
          quote?.display_price ??
          quote?.actual_price ??
          null
        const receivedAt = quote?.lastUpdateTime ?? quote?.timestamp ?? null
        const ageMs = receivedAt ? now - receivedAt : null
        const localLastTickAt = lastTickAt[token] ?? null
        const silenceMs = localLastTickAt ? now - localLastTickAt : null
        const error = live.subscriptionErrorsByToken?.[token]
        const matchedCanonical = CANONICAL_TOKENS.find((c) => c.token === token)
        return {
          token,
          name: matchedCanonical?.name ?? null,
          ltp,
          tickCount: tickCounts[token] ?? 0,
          ageMs,
          silenceMs,
          firstTickAt: firstTickAt[token] ?? null,
          error,
          rawQuote: quote,
        }
      })
  }, [
    subscribed,
    live.quotes,
    live.subscriptionErrorsByToken,
    tickCounts,
    firstTickAt,
    lastTickAt,
    tickClock,
  ])

  // Aggregate diagnostics for the header strip
  const totalTicks = useMemo(
    () => Object.values(tickCounts).reduce((a, b) => a + b, 0),
    [tickCounts],
  )
  const totalQuotes = Object.keys(live.quotes ?? {}).length
  const totalSubErrors = Object.keys(live.subscriptionErrorsByToken ?? {}).length

  const envSnapshot = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_URL ?? "(unset — uses dev fallback)"
    const apiKey = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY ?? "(unset — uses 'demo-key-1')"
    const enableEnv = process.env.NEXT_PUBLIC_ENABLE_WS_MARKET_DATA ?? "(unset)"
    const debugEnv = process.env.NEXT_PUBLIC_DEBUG_MARKETDATA ?? "(unset)"
    return { url, apiKey, enableEnv, debugEnv, nodeEnv: process.env.NODE_ENV ?? "(unset)" }
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Market Data — Dashboard-Linked Diagnostic
              </CardTitle>
              <CardDescription className="mt-1">
                Wraps in <code className="px-1 py-0.5 rounded bg-muted text-xs">WebSocketMarketDataProvider</code>{" "}
                — exact same connection layer the dashboard uses.
              </CardDescription>
            </div>
            <ConnectionBadge state={live.isConnected} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <Stat label="State" value={live.isConnected} />
            <Stat label="Subscribed" value={subscribed.size} />
            <Stat label="Quotes in map" value={totalQuotes} />
            <Stat label="Total ticks" value={totalTicks} />
            <Stat label="Sub errors" value={totalSubErrors} />
          </div>
          {live.error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-red-800">Error: {live.error.code ?? "UNKNOWN"}</div>
                <div className="text-red-600">{live.error.message ?? "Unknown error"}</div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <Button onClick={handleReconnect} variant="outline" size="sm" className="gap-1">
              <RefreshCw className="w-3 h-3" /> Reconnect transport
            </Button>
            <Button
              onClick={handleClearAll}
              variant="outline"
              size="sm"
              disabled={subscribed.size === 0}
              className="gap-1"
            >
              <Trash2 className="w-3 h-3" /> Clear all subscriptions
            </Button>
            <Badge variant="outline" className="ml-auto font-mono text-[10px]">
              userId: {userId}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Env Debug */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Environment Resolution</CardTitle>
          <CardDescription>
            Values the provider would see <i>without</i> overrides. Override box above wins.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 font-mono text-xs">
          <DebugRow k="NODE_ENV" v={envSnapshot.nodeEnv} />
          <DebugRow k="NEXT_PUBLIC_LIVE_MARKET_WS_URL" v={envSnapshot.url} />
          <DebugRow k="NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY" v={maskApiKey(envSnapshot.apiKey)} />
          <DebugRow k="NEXT_PUBLIC_ENABLE_WS_MARKET_DATA" v={envSnapshot.enableEnv} />
          <DebugRow k="NEXT_PUBLIC_DEBUG_MARKETDATA" v={envSnapshot.debugEnv} />
          <div className="pt-2 text-[11px] text-muted-foreground font-sans space-y-1">
            <div>
              <span className="font-medium">Currently applied URL:</span>{" "}
              <code className="px-1 rounded bg-muted">{appliedUrl || "(empty)"}</code>
            </div>
            <div>
              <span className="font-medium">Currently applied API key:</span>{" "}
              <code className="px-1 rounded bg-muted">{maskApiKey(appliedApiKey || "(empty)")}</code>
            </div>
            <div>
              Namespace handling: SocketIOClient does{" "}
              <code className="px-1 rounded bg-muted">io(baseUrl + namespace, {"{"} path: '/socket.io' {"}"})</code>
              . Bare hosts default the namespace to <code className="px-1 rounded bg-muted">/market-data</code>.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscribe controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscribe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center mr-1">Canonical:</span>
            {CANONICAL_TOKENS.map(({ token, name, note }) => (
              <Button
                key={token}
                variant="outline"
                size="sm"
                onClick={() => setTokenInput(token.toString())}
                title={note ? `${name} — ${note}` : name}
                className="text-xs font-mono"
              >
                {name} <span className="text-muted-foreground ml-1">({token})</span>
              </Button>
            ))}
          </div>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Instrument Token
              </label>
              <Input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="26571"
                type="number"
                className="font-mono"
              />
            </div>
            <div className="w-32">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode((e.target as HTMLSelectElement).value as SubscriptionMode)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                {SUBSCRIPTION_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={handleSubscribe} disabled={live.isConnected !== "connected"} className="gap-1">
              <Send className="w-3 h-3" /> Subscribe
            </Button>
            <Button
              onClick={handleSubscribeAllCanonical}
              disabled={live.isConnected !== "connected"}
              variant="secondary"
              className="gap-1"
            >
              Subscribe All Canonical
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live tokens */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Active Tokens
            <Badge variant="outline">{subscribedRows.length}</Badge>
          </CardTitle>
          <CardDescription>
            Silence column = ms since last LTP merge for that token (yellow ≥ {SILENCE_WARN_MS}ms,
            red ≥ {SILENCE_ALERT_MS}ms).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscribedRows.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No active subscriptions. Pick a canonical token or enter one above.
            </div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto">
              {subscribedRows.map((row) => (
                <TokenRow
                  key={row.token}
                  row={row}
                  onUnsubscribe={() => handleUnsubscribe(row.token)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connection state timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Connection Timeline
            <Badge variant="outline">{stateHistory.length}</Badge>
          </CardTitle>
          <CardDescription>
            Reconnect storms show up here as a rapid disconnect → connecting → connected sequence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stateHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              No state transitions yet.
            </div>
          ) : (
            <div className="bg-zinc-950 text-zinc-200 rounded p-3 max-h-40 overflow-y-auto text-xs font-mono">
              {stateHistory.map((line, i) => (
                <div
                  key={`${line.t}-${i}`}
                  className={
                    line.state === "connected"
                      ? "text-green-400"
                      : line.state === "error"
                        ? "text-red-400"
                        : line.state === "connecting"
                          ? "text-amber-400"
                          : "text-zinc-400"
                  }
                >
                  <span className="text-zinc-500">
                    [{new Date(line.t).toLocaleTimeString("en-IN", { hour12: false })}]
                  </span>{" "}
                  → {line.state}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Raw socket event log */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Raw Socket Events
                <Badge variant="outline">{eventLog.length}</Badge>
              </CardTitle>
              <CardDescription>
                Direct from <code className="px-1 rounded bg-muted text-xs">onTransportEvent</code>:
                connected · disconnected · subscriptionConfirmed · error · initError. Newest first.
              </CardDescription>
            </div>
            <Button onClick={onClearEventLog} variant="outline" size="sm" disabled={eventLog.length === 0}>
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-zinc-950 text-zinc-200 rounded p-3 max-h-[480px] overflow-y-auto text-xs font-mono space-y-1">
            {eventLog.length === 0 ? (
              <div className="text-zinc-500 text-center py-8">No socket events yet.</div>
            ) : (
              eventLog.map((evt) => <EventLine key={evt.id} evt={evt} />)
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// =====================================================================
// Sub-components
// =====================================================================
function ConnectionBadge({ state }: { state: string }) {
  switch (state) {
    case "connected":
      return (
        <Badge className="bg-green-500 text-white">
          <Wifi className="w-3 h-3 mr-1" /> Connected
        </Badge>
      )
    case "connecting":
      return (
        <Badge className="bg-yellow-500 text-white">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Connecting
        </Badge>
      )
    case "error":
      return (
        <Badge className="bg-red-500 text-white">
          <AlertCircle className="w-3 h-3 mr-1" /> Error
        </Badge>
      )
    default:
      return (
        <Badge className="bg-gray-500 text-white">
          <WifiOff className="w-3 h-3 mr-1" /> Disconnected
        </Badge>
      )
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded p-2">
      <div className="text-[11px] uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className="font-mono text-sm font-semibold mt-0.5 truncate">{String(value)}</div>
    </div>
  )
}

function DebugRow({ k, v }: { k: string; v: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = () => {
    void navigator.clipboard.writeText(`${k}=${v}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-muted-foreground">=</span>
      <span className="truncate flex-1">{v}</span>
      <button
        type="button"
        onClick={onCopy}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Copy"
      >
        {copied ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  )
}

type TokenRowData = {
  token: number
  name: string | null
  ltp: number | null
  tickCount: number
  ageMs: number | null
  silenceMs: number | null
  firstTickAt: number | null
  error: { code: string; message: string } | undefined
  rawQuote: unknown
}

function TokenRow({ row, onUnsubscribe }: { row: TokenRowData; onUnsubscribe: () => void }) {
  const [showRaw, setShowRaw] = useState(false)
  const ageBadgeClass =
    row.ageMs == null
      ? "bg-gray-200 text-gray-700"
      : row.ageMs < 2000
        ? "bg-green-100 text-green-800"
        : row.ageMs < 10000
          ? "bg-amber-100 text-amber-800"
          : "bg-red-100 text-red-800"
  const silenceBadgeClass =
    row.silenceMs == null
      ? "bg-gray-100 text-gray-600"
      : row.silenceMs < SILENCE_WARN_MS
        ? "bg-green-100 text-green-800"
        : row.silenceMs < SILENCE_ALERT_MS
          ? "bg-amber-100 text-amber-800"
          : "bg-red-100 text-red-800"
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-sm">{row.token}</span>
            {row.name && (
              <Badge variant="secondary" className="text-[10px]">
                {row.name}
              </Badge>
            )}
            {row.error && (
              <Badge className="bg-red-500 text-white text-[10px]">{row.error.code}</Badge>
            )}
            {row.tickCount === 0 && !row.error && (
              <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                no ticks yet
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs flex-wrap">
            <span className="font-mono">
              LTP:{" "}
              <span className={row.ltp == null ? "text-muted-foreground italic" : "font-semibold"}>
                {row.ltp == null
                  ? "—"
                  : `₹${row.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}
              </span>
            </span>
            <span className="text-muted-foreground">
              <Activity className="inline w-3 h-3 mr-0.5" />
              {row.tickCount} ticks
            </span>
            <span className={`px-1.5 py-0.5 rounded ${ageBadgeClass}`}>
              quote age: {row.ageMs == null ? "—" : `${row.ageMs}ms`}
            </span>
            <span className={`px-1.5 py-0.5 rounded ${silenceBadgeClass}`}>
              silence: {row.silenceMs == null ? "—" : `${formatDuration(row.silenceMs)}`}
            </span>
          </div>
          {row.error && <div className="text-xs text-red-600 mt-1">{row.error.message}</div>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowRaw((s) => !s)}
            className="text-xs"
          >
            {showRaw ? "Hide" : "Raw"}
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={onUnsubscribe} className="gap-1">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {showRaw && (
        <pre className="mt-2 text-[10px] bg-zinc-950 text-zinc-200 p-2 rounded overflow-x-auto max-h-64">
          {JSON.stringify(row.rawQuote, null, 2)}
        </pre>
      )}
    </div>
  )
}

function EventLine({ evt }: { evt: WSTransportEvent & { id: number } }) {
  const [expanded, setExpanded] = useState(false)
  const color =
    evt.type === "connected"
      ? "text-green-400"
      : evt.type === "disconnected"
        ? "text-amber-400"
        : evt.type === "error" || evt.type === "initError"
          ? "text-red-400"
          : evt.type === "subscriptionConfirmed"
            ? "text-cyan-300"
            : "text-zinc-300"
  const hasData = evt.data !== undefined
  return (
    <div className={color}>
      <div className="flex items-baseline gap-2">
        <span className="text-zinc-500">
          [{new Date(evt.timestamp).toLocaleTimeString("en-IN", { hour12: false })}.{String(evt.timestamp % 1000).padStart(3, "0")}]
        </span>
        <span className="font-bold">{evt.type}</span>
        {hasData && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] underline text-zinc-400 hover:text-zinc-200"
          >
            {expanded ? "hide payload" : "show payload"}
          </button>
        )}
      </div>
      {expanded && hasData && (
        <pre className="mt-1 ml-4 text-[10px] text-zinc-400 whitespace-pre-wrap break-all">
          {safeJsonStringify(evt.data)}
        </pre>
      )}
    </div>
  )
}

function safeJsonStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m${rem.toString().padStart(2, "0")}s`
}

function maskApiKey(key: string): string {
  if (!key || key.startsWith("(unset")) return key
  if (key.length <= 8) return key
  return `${key.slice(0, 6)}…${key.slice(-2)}`
}
