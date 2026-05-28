# Watchlist → Order Robustness & UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tick-flash animations, feed status banner, quick order overlay, and persistent order status card to the trading app's watchlist→order flow.

**Architecture:** Pure logic hooks (`useFeedStatus`, `useOrderStatus`, `resolveRejection`) are built and tested first, then UI components wrap them. The `QuickOrderOverlay` lives inside `WatchlistOrderDrawer`; `FeedStatusBanner` and `PersistentOrderCard` mount in `TradingDashboard`.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS 4, Vaul bottom sheet, SWR, framer-motion, Prisma (no new models)

---

## File Map

**New files:**
- `lib/market-data/constants.ts` — shared numeric thresholds
- `lib/order/rejection-codes.ts` — `failureCode` → `{fixable, humanMessage}` lookup
- `lib/market-data/hooks/useFeedStatus.ts` — LIVE/DEGRADED/STALE/OFFLINE state machine hook
- `hooks/use-order-status.ts` — SWR polling hook for order status after placement
- `components/trading/FeedStatusBanner.tsx` — amber/red banner shown atop watchlist
- `components/trading/order-drawer/PersistentOrderCard.tsx` — docked bottom card for order outcomes
- `components/trading/order-drawer/QuickOrderOverlay.tsx` — compact 3-field order overlay from peek state
- `tests/lib/order/rejection-codes.test.ts`
- `tests/lib/market-data/hooks/feedStatusMachine.test.ts`
- `tests/hooks/use-order-status.test.ts`

**Modified files:**
- `app/globals.css` — add `@keyframes tickFlashUp / tickFlashDown`
- `components/watchlist/WatchlistItemCard.tsx` — apply flash animation + staleness dim
- `components/trading/order-drawer/WatchlistOrderDrawer.tsx` — wire `QuickOrderOverlay`, surface Buy/Sell from peek, emit `orderId`
- `components/trading/TradingDashboard.tsx` — mount `FeedStatusBanner` + `PersistentOrderCard`, thread `orderId` through `handleOrderPlaced`

---

> **Mirror policy:** Each task commits to `tradingpro-platform/` only. Do NOT push after individual task commits. The TradeBazaar mirror commit + push for both repos happens in **Task 10** as a single batch. This is required by CLAUDE.md: commit → mirror-commit → push both.

---

## Task 1: Constants

**Files:**
- Create: `lib/market-data/constants.ts`

- [ ] **Step 1: Create constants file**

```typescript
/**
 * File:        lib/market-data/constants.ts
 * Module:      Market Data · Constants
 * Purpose:     Shared numeric thresholds for price staleness and feed-status escalation.
 *
 * Exports:
 *   - STALE_PRICE_THRESHOLD_MS — ms after which a quote is considered stale
 *   - FEED_DEGRADED_ESCALATION_MS — ms of WS disconnection before status escalates to STALE
 *   - ORDER_POLL_INTERVAL_MS — SWR refetch interval for order status polling
 *   - ORDER_POLL_MAX_DURATION_MS — stop polling after this many ms
 *
 * Depends on: none
 * Side-effects: none
 * Key invariants: none
 * Read order: top to bottom
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

export const STALE_PRICE_THRESHOLD_MS = 30_000
export const FEED_DEGRADED_ESCALATION_MS = 30_000
export const ORDER_POLL_INTERVAL_MS = 2_000
export const ORDER_POLL_MAX_DURATION_MS = 60_000
```

- [ ] **Step 2: Commit**

```bash
git add lib/market-data/constants.ts
git commit -m "feat(market-data): add feed staleness and order poll constants"
```

---

## Task 2: Rejection Code Lookup

**Files:**
- Create: `lib/order/rejection-codes.ts`
- Create: `tests/lib/order/rejection-codes.test.ts`

- [ ] **Step 1: Write failing tests first**

```typescript
// tests/lib/order/rejection-codes.test.ts
import { resolveRejection } from "@/lib/order/rejection-codes"

describe("resolveRejection", () => {
  it("marks INSUFFICIENT_MARGIN as fixable", () => {
    const result = resolveRejection("INSUFFICIENT_MARGIN")
    expect(result.fixable).toBe(true)
    expect(result.humanMessage).toContain("margin")
  })

  it("marks MARKET_CLOSED as hard reject", () => {
    const result = resolveRejection("MARKET_CLOSED")
    expect(result.fixable).toBe(false)
  })

  it("marks RISK_LIMIT_EXCEEDED as hard reject", () => {
    expect(resolveRejection("RISK_LIMIT_EXCEEDED").fixable).toBe(false)
  })

  it("marks INVALID_QTY as fixable", () => {
    expect(resolveRejection("INVALID_QTY").fixable).toBe(true)
  })

  it("marks PRICE_OUT_OF_RANGE as fixable", () => {
    expect(resolveRejection("PRICE_OUT_OF_RANGE").fixable).toBe(true)
  })

  it("returns fixable=false for unknown code", () => {
    const result = resolveRejection("SOME_UNKNOWN_CODE_XYZ")
    expect(result.fixable).toBe(false)
    expect(result.humanMessage).toBeTruthy()
  })

  it("returns fixable=false for null code", () => {
    expect(resolveRejection(null).fixable).toBe(false)
  })

  it("returns fixable=false for undefined code", () => {
    expect(resolveRejection(undefined).fixable).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd tradingpro-platform
npx jest --config jest.config.cjs tests/lib/order/rejection-codes.test.ts --forceExit
```

Expected: `FAIL — Cannot find module '@/lib/order/rejection-codes'`

- [ ] **Step 3: Implement rejection-codes.ts**

```typescript
/**
 * File:        lib/order/rejection-codes.ts
 * Module:      Order · Rejection Codes
 * Purpose:     Maps failureCode strings (from /api/trading/orders/status) to fixable flag
 *              and a human-readable message for display in PersistentOrderCard.
 *
 * Exports:
 *   - resolveRejection(failureCode) → RejectionInfo — lookup with unknown-code fallback
 *   - RejectionInfo — { fixable: boolean, humanMessage: string }
 *
 * Depends on: none
 * Side-effects: none
 * Key invariants:
 *   - Unknown / null / undefined codes always return fixable=false (safe default — no retry shown)
 *   - failureCode values match the strings written to Order.failureCode in OrderExecutionService
 * Read order:
 *   1. RejectionInfo — type
 *   2. REJECTION_CODE_MAP — code table
 *   3. resolveRejection — exported function
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

export interface RejectionInfo {
  fixable: boolean
  humanMessage: string
}

const FALLBACK: RejectionInfo = { fixable: false, humanMessage: "Order rejected by exchange" }

const REJECTION_CODE_MAP: Record<string, RejectionInfo> = {
  INSUFFICIENT_MARGIN: {
    fixable: true,
    humanMessage: "Insufficient margin — reduce quantity or add funds",
  },
  INVALID_QTY: {
    fixable: true,
    humanMessage: "Invalid quantity — check lot size requirements",
  },
  PRICE_OUT_OF_RANGE: {
    fixable: true,
    humanMessage: "Price is outside circuit limits",
  },
  MARKET_CLOSED: {
    fixable: false,
    humanMessage: "Market is currently closed",
  },
  SEGMENT_DISABLED: {
    fixable: false,
    humanMessage: "Segment is not enabled for trading",
  },
  RISK_LIMIT_EXCEEDED: {
    fixable: false,
    humanMessage: "Risk limit exceeded — contact support",
  },
  EXCHANGE_REJECTED: {
    fixable: false,
    humanMessage: "Order rejected by exchange",
  },
}

export function resolveRejection(failureCode: string | null | undefined): RejectionInfo {
  if (typeof failureCode !== "string" || !failureCode.trim()) return FALLBACK
  return REJECTION_CODE_MAP[failureCode.trim()] ?? FALLBACK
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest --config jest.config.cjs tests/lib/order/rejection-codes.test.ts --forceExit
```

Expected: `PASS — 8 tests, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/order/rejection-codes.ts tests/lib/order/rejection-codes.test.ts
git commit -m "feat(order): add rejection code lookup with fixable/hard classification"
```

---

## Task 3: Feed Status State Machine + Hook

**Files:**
- Create: `lib/market-data/hooks/useFeedStatus.ts`
- Create: `tests/lib/market-data/hooks/feedStatusMachine.test.ts`

The state machine logic will be extracted as a pure function so we can test it without React.

- [ ] **Step 1: Write failing tests for the state machine**

```typescript
// tests/lib/market-data/hooks/feedStatusMachine.test.ts
import { deriveFeedStatus } from "@/lib/market-data/hooks/useFeedStatus"

describe("deriveFeedStatus", () => {
  const BASE = { isConnected: "connected" as const, isOffline: false, disconnectedMs: 0 }

  it("returns LIVE when connected and online", () => {
    expect(deriveFeedStatus({ ...BASE })).toBe("LIVE")
  })

  it("returns OFFLINE when navigator is offline regardless of WS state", () => {
    expect(deriveFeedStatus({ ...BASE, isOffline: true })).toBe("OFFLINE")
    expect(deriveFeedStatus({ ...BASE, isConnected: "disconnected", isOffline: true })).toBe("OFFLINE")
  })

  it("returns DEGRADED when disconnected and within escalation window", () => {
    expect(deriveFeedStatus({ ...BASE, isConnected: "disconnected", disconnectedMs: 10_000 })).toBe("DEGRADED")
    expect(deriveFeedStatus({ ...BASE, isConnected: "disconnected", disconnectedMs: 29_999 })).toBe("DEGRADED")
  })

  it("returns STALE when disconnected beyond 30s", () => {
    expect(deriveFeedStatus({ ...BASE, isConnected: "disconnected", disconnectedMs: 30_000 })).toBe("STALE")
    expect(deriveFeedStatus({ ...BASE, isConnected: "disconnected", disconnectedMs: 60_000 })).toBe("STALE")
  })

  it("returns STALE for error and connecting states beyond 30s", () => {
    expect(deriveFeedStatus({ ...BASE, isConnected: "error", disconnectedMs: 35_000 })).toBe("STALE")
    expect(deriveFeedStatus({ ...BASE, isConnected: "connecting", disconnectedMs: 35_000 })).toBe("STALE")
  })

  it("returns DEGRADED for error/connecting within escalation window", () => {
    expect(deriveFeedStatus({ ...BASE, isConnected: "error", disconnectedMs: 5_000 })).toBe("DEGRADED")
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npx jest --config jest.config.cjs tests/lib/market-data/hooks/feedStatusMachine.test.ts --forceExit
```

Expected: `FAIL — Cannot find module`

- [ ] **Step 3: Implement useFeedStatus.ts**

```typescript
/**
 * File:        lib/market-data/hooks/useFeedStatus.ts
 * Module:      Market Data · Feed Status
 * Purpose:     Derives a 4-level feed quality status from WebSocket connection state
 *              + navigator.onLine, used by FeedStatusBanner and order guards.
 *
 * Exports:
 *   - FeedStatus — "LIVE" | "DEGRADED" | "STALE" | "OFFLINE"
 *   - FeedStatusInfo — { status, disconnectedSinceMs }
 *   - useFeedStatus() → FeedStatusInfo — React hook
 *   - deriveFeedStatus(args) → FeedStatus — pure state machine (exported for testing)
 *
 * Depends on:
 *   - @/lib/market-data/providers/WebSocketMarketDataProvider — useMarketDataLive()
 *   - @/lib/market-data/constants — FEED_DEGRADED_ESCALATION_MS
 *
 * Side-effects: setInterval (1s tick for UI counter update)
 *
 * Key invariants:
 *   - OFFLINE takes precedence over WS state — network is more fundamental than socket
 *   - disconnectedSinceMs is null when LIVE; otherwise ms since first non-connected event
 *
 * Read order:
 *   1. FeedStatus / FeedStatusInfo — types
 *   2. deriveFeedStatus — pure logic (testable without React)
 *   3. useFeedStatus — React wrapper
 *
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

"use client"

import { useEffect, useRef, useState } from "react"
import { useMarketDataLive } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { FEED_DEGRADED_ESCALATION_MS } from "@/lib/market-data/constants"
import type { ConnectionState } from "@/lib/market-data/providers/types"

export type FeedStatus = "LIVE" | "DEGRADED" | "STALE" | "OFFLINE"

export interface FeedStatusInfo {
  status: FeedStatus
  /** null when LIVE; otherwise ms since the connection first dropped */
  disconnectedSinceMs: number | null
}

interface DeriveFeedStatusArgs {
  isConnected: ConnectionState
  isOffline: boolean
  disconnectedMs: number
}

export function deriveFeedStatus({ isConnected, isOffline, disconnectedMs }: DeriveFeedStatusArgs): FeedStatus {
  if (isOffline) return "OFFLINE"
  if (isConnected === "connected") return "LIVE"
  if (disconnectedMs >= FEED_DEGRADED_ESCALATION_MS) return "STALE"
  return "DEGRADED"
}

export function useFeedStatus(): FeedStatusInfo {
  const { isConnected } = useMarketDataLive()
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false
  )
  const [tick, setTick] = useState(0)
  const disconnectedSinceRef = useRef<number | null>(null)

  // Track WS connection state changes to record disconnect timestamp
  useEffect(() => {
    if (isConnected === "connected") {
      disconnectedSinceRef.current = null
    } else if (disconnectedSinceRef.current === null) {
      disconnectedSinceRef.current = Date.now()
    }
  }, [isConnected])

  // 1-second ticker so disconnectedSinceMs stays current in the UI
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  // Track navigator.onLine
  useEffect(() => {
    const onOnline = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  // Suppress unused-variable warning for tick — it exists purely to trigger re-renders
  void tick

  const disconnectedMs = disconnectedSinceRef.current ? Date.now() - disconnectedSinceRef.current : 0
  const status = deriveFeedStatus({ isConnected, isOffline, disconnectedMs })

  return {
    status,
    disconnectedSinceMs: status === "LIVE" ? null : disconnectedMs,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest --config jest.config.cjs tests/lib/market-data/hooks/feedStatusMachine.test.ts --forceExit
```

Expected: `PASS — 6 tests, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/market-data/hooks/useFeedStatus.ts tests/lib/market-data/hooks/feedStatusMachine.test.ts
git commit -m "feat(market-data): add useFeedStatus hook with 4-state feed quality machine"
```

---

## Task 4: Tick Flash CSS + WatchlistItemCard Staleness

**Files:**
- Modify: `app/globals.css` — add keyframes
- Modify: `components/watchlist/WatchlistItemCard.tsx` — apply flash + dim

- [ ] **Step 1: Add keyframes to globals.css**

Open `app/globals.css` and append at the end of the file:

```css
/* Price tick flash animations — used by WatchlistItemCard */
@keyframes tickFlashUp {
  0% { background-color: #14532d; }
  100% { background-color: transparent; }
}
@keyframes tickFlashDown {
  0% { background-color: #450a0a; }
  100% { background-color: transparent; }
}
.tick-flash-up {
  animation: tickFlashUp 400ms ease-out forwards;
  border-radius: 4px;
}
.tick-flash-down {
  animation: tickFlashDown 400ms ease-out forwards;
  border-radius: 4px;
}
```

- [ ] **Step 2: Add tick direction tracking to WatchlistItemCard**

In `components/watchlist/WatchlistItemCard.tsx`, find the line that reads the `quote` prop (around line 144) and add the following state and effect **inside** the `WatchlistItemCard` function body, right after the existing `useState`/`useMemo` calls:

```tsx
// --- Tick flash tracking ---
const prevPriceRef = React.useRef<number | null>(null)
const [tickClass, setTickClass] = React.useState<"tick-flash-up" | "tick-flash-down" | "">("")
const flashTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

const currentPrice = quote?.display_price ?? null

React.useEffect(() => {
  if (currentPrice === null) return
  const prev = prevPriceRef.current
  prevPriceRef.current = currentPrice
  if (prev === null) return

  if (currentPrice > prev) {
    setTickClass("tick-flash-up")
  } else if (currentPrice < prev) {
    setTickClass("tick-flash-down")
  } else {
    return
  }

  if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
  flashTimeoutRef.current = setTimeout(() => setTickClass(""), 420)
}, [currentPrice])

React.useEffect(() => () => {
  if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
}, [])
// --- end tick flash tracking ---
```

- [ ] **Step 3: Add staleness computation inside WatchlistItemCard**

Directly after the tick-flash block, add:

```tsx
// --- Staleness ---
const STALE_MS = 30_000
const quoteAge = quote?.lastUpdateTime ? Date.now() - quote.lastUpdateTime : null
const isStale = quoteAge !== null && quoteAge > STALE_MS
const staleSeconds = isStale && quoteAge !== null ? Math.floor(quoteAge / 1000) : null
// --- end staleness ---
```

- [ ] **Step 4: Apply flash class to the price display span**

Find the JSX that renders the LTP / `display_price` value in the return statement. It will be inside a `<span>` or `<div>` showing the price. Wrap just the price value span with `className={cn("...", tickClass)}`:

Search for the price display element. It will look like something with `displayPrice` or `₹`. Add `className={cn(existingClasses, tickClass)}` to that element.

Example (adapt to the actual JSX structure at line ~484+):
```tsx
{/* Before */}
<span className="text-sm font-bold text-green-400">{displayPrice}</span>

{/* After */}
<span className={cn("text-sm font-bold text-green-400", tickClass)}>{displayPrice}</span>
```

- [ ] **Step 5: Apply staleness dim to the whole card row**

Find the outermost `<div>` or `<Card>` returned by the component. Add conditional opacity and stale label:

```tsx
{/* On the outer card/row wrapper, add: */}
style={{ opacity: isStale ? 0.45 : 1, transition: "opacity 0.3s" }}
```

For the stale age label, find where the price is displayed and add next to it:
```tsx
{isStale && staleSeconds !== null && (
  <span className="text-[9px] text-amber-500 ml-1">({staleSeconds}s)</span>
)}
```

- [ ] **Step 6: Verify manually**

```bash
cd tradingpro-platform && npm run type-check 2>&1 | grep -E "WatchlistItemCard|Error" | head -10
```

Expected: No new type errors in WatchlistItemCard.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css components/watchlist/WatchlistItemCard.tsx
git commit -m "feat(watchlist): add tick flash animation and price staleness dim (>30s)"
```

---

## Task 5: FeedStatusBanner Component

**Files:**
- Create: `components/trading/FeedStatusBanner.tsx`
- Modify: `components/trading/TradingDashboard.tsx` — mount the banner

- [ ] **Step 1: Create FeedStatusBanner.tsx**

```tsx
/**
 * File:        components/trading/FeedStatusBanner.tsx
 * Module:      Trading · Feed Status Banner
 * Purpose:     Slim top banner shown when WebSocket feed is DEGRADED, STALE, or OFFLINE.
 *              Slides in when status deteriorates, slides out + flashes green on recovery.
 *
 * Exports:
 *   - FeedStatusBanner() — renders nothing when LIVE
 *
 * Depends on:
 *   - @/lib/market-data/hooks/useFeedStatus — FeedStatus state machine
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Returns null when status === "LIVE" — no DOM node in the happy path
 *   - "Live ✓" recovery flash is shown for 1500ms then clears
 *
 * Read order:
 *   1. FeedStatusBanner — JSX
 *
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

"use client"

import React from "react"
import { useFeedStatus } from "@/lib/market-data/hooks/useFeedStatus"
import { cn } from "@/lib/utils"

export function FeedStatusBanner() {
  const { status, disconnectedSinceMs } = useFeedStatus()
  const [showRecovery, setShowRecovery] = React.useState(false)
  const prevStatusRef = React.useRef(status)

  React.useEffect(() => {
    if (prevStatusRef.current !== "LIVE" && status === "LIVE") {
      setShowRecovery(true)
      const id = setTimeout(() => setShowRecovery(false), 1_500)
      return () => clearTimeout(id)
    }
    prevStatusRef.current = status
  }, [status])

  if (status === "LIVE" && !showRecovery) return null

  if (showRecovery) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold bg-emerald-900/60 border-b border-emerald-700 text-emerald-300">
        <span>✓ Live feed restored</span>
      </div>
    )
  }

  const ageSeconds = disconnectedSinceMs ? Math.floor(disconnectedSinceMs / 1000) : null

  if (status === "OFFLINE") {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold bg-red-950 border-b border-red-800 text-red-300">
        <span>✗ No connection — trading paused</span>
      </div>
    )
  }

  const message =
    status === "STALE"
      ? `⚡ Feed paused${ageSeconds ? ` (${ageSeconds}s)` : ""} — market orders disabled`
      : `⚡ Reconnecting… prices may be delayed`

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5 text-xs font-semibold border-b",
        "bg-amber-950 border-amber-800 text-amber-300"
      )}
    >
      <span>{message}</span>
      {ageSeconds !== null && <span className="text-amber-600 tabular-nums">{ageSeconds}s</span>}
    </div>
  )
}
```

- [ ] **Step 2: Mount FeedStatusBanner in TradingDashboard**

In `components/trading/TradingDashboard.tsx`, add the import at the top with the other trading imports:

```tsx
import { FeedStatusBanner } from "@/components/trading/FeedStatusBanner"
```

Find the `<WatchlistManager .../>` render (around line 713). It's inside a container div. Add `<FeedStatusBanner />` immediately **above** the `<WatchlistManager>`:

```tsx
{/* Before WatchlistManager */}
<FeedStatusBanner />
<WatchlistManager ... />
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check 2>&1 | grep -E "FeedStatusBanner|TradingDashboard" | head -10
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/trading/FeedStatusBanner.tsx components/trading/TradingDashboard.tsx
git commit -m "feat(trading): add FeedStatusBanner — ambient/stale/offline feed state"
```

---

## Task 6: Order Status Polling Hook

**Files:**
- Create: `hooks/use-order-status.ts`
- Create: `tests/hooks/use-order-status.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/hooks/use-order-status.test.ts
import {
  isTerminalOrderStatus,
  buildOrderStatusUrl,
} from "@/hooks/use-order-status"

describe("isTerminalOrderStatus", () => {
  it("returns true for EXECUTED", () => expect(isTerminalOrderStatus("EXECUTED")).toBe(true))
  it("returns true for REJECTED", () => expect(isTerminalOrderStatus("REJECTED")).toBe(true))
  it("returns true for CANCELLED", () => expect(isTerminalOrderStatus("CANCELLED")).toBe(true))
  it("returns true for EXPIRED", () => expect(isTerminalOrderStatus("EXPIRED")).toBe(true))
  it("returns true for PARTIALLY_FILLED", () => expect(isTerminalOrderStatus("PARTIALLY_FILLED")).toBe(true))
  it("returns false for PENDING", () => expect(isTerminalOrderStatus("PENDING")).toBe(false))
  it("returns false for null", () => expect(isTerminalOrderStatus(null)).toBe(false))
  it("returns false for unknown string", () => expect(isTerminalOrderStatus("QUEUED")).toBe(false))
})

describe("buildOrderStatusUrl", () => {
  it("returns null when orderId is null", () => expect(buildOrderStatusUrl(null)).toBe(null))
  it("builds correct URL when orderId is provided", () => {
    expect(buildOrderStatusUrl("abc123")).toBe("/api/trading/orders/status?orderId=abc123")
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npx jest --config jest.config.cjs tests/hooks/use-order-status.test.ts --forceExit
```

Expected: `FAIL — Cannot find module`

- [ ] **Step 3: Implement use-order-status.ts**

```typescript
/**
 * File:        hooks/use-order-status.ts
 * Module:      Hooks · Order Status
 * Purpose:     SWR polling hook for order status after placement. Polls every 2s until the
 *              order reaches a terminal state (EXECUTED/REJECTED/CANCELLED/EXPIRED) or 60s elapses.
 *
 * Exports:
 *   - useOrderStatus(orderId) → OrderStatusData — the React hook
 *   - isTerminalOrderStatus(status) → boolean — pure helper (exported for tests)
 *   - buildOrderStatusUrl(orderId) → string | null — pure helper (exported for tests)
 *   - OrderStatusData — response shape from /api/trading/orders/status
 *
 * Depends on:
 *   - swr — for SWR polling
 *   - @/lib/market-data/constants — ORDER_POLL_INTERVAL_MS, ORDER_POLL_MAX_DURATION_MS
 *
 * Side-effects: SWR fetch to /api/trading/orders/status
 *
 * Key invariants:
 *   - Polling stops as soon as a terminal status is received — no further requests
 *   - The startTime ref resets whenever orderId changes so a new order always gets a fresh 60s window
 *
 * Read order:
 *   1. OrderStatusData — API response shape
 *   2. TERMINAL_STATUSES — set of terminal status strings
 *   3. isTerminalOrderStatus / buildOrderStatusUrl — pure helpers
 *   4. useOrderStatus — main hook
 *
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

"use client"

import { useRef } from "react"
import useSWR from "swr"
import { ORDER_POLL_INTERVAL_MS, ORDER_POLL_MAX_DURATION_MS } from "@/lib/market-data/constants"

export interface OrderStatusData {
  success: boolean
  orderId: string
  status: string
  symbol: string
  quantity: number
  price: number | null
  averagePrice: number | null
  filledQuantity: number
  failureCode: string | null
  failureReason: string | null
  createdAt: string
}

const TERMINAL_STATUSES = new Set([
  "EXECUTED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
  "PARTIALLY_FILLED",
])

export function isTerminalOrderStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return TERMINAL_STATUSES.has(status)
}

export function buildOrderStatusUrl(orderId: string | null): string | null {
  if (!orderId) return null
  return `/api/trading/orders/status?orderId=${orderId}`
}

async function fetcher(url: string): Promise<OrderStatusData> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Order status fetch failed: ${res.status}`)
  return res.json()
}

export function useOrderStatus(orderId: string | null) {
  const startTimeRef = useRef<number>(Date.now())

  // Reset start time when orderId changes (new order = fresh 60s window)
  const prevOrderIdRef = useRef<string | null>(null)
  if (orderId !== prevOrderIdRef.current) {
    prevOrderIdRef.current = orderId
    startTimeRef.current = Date.now()
  }

  const elapsedMs = Date.now() - startTimeRef.current
  const withinWindow = elapsedMs < ORDER_POLL_MAX_DURATION_MS

  const { data, error, isLoading } = useSWR<OrderStatusData>(
    buildOrderStatusUrl(orderId),
    fetcher,
    {
      refreshInterval: (latestData) => {
        if (!latestData) return withinWindow ? ORDER_POLL_INTERVAL_MS : 0
        if (isTerminalOrderStatus(latestData.status)) return 0
        if (Date.now() - startTimeRef.current >= ORDER_POLL_MAX_DURATION_MS) return 0
        return ORDER_POLL_INTERVAL_MS
      },
      revalidateOnFocus: false,
      dedupingInterval: ORDER_POLL_INTERVAL_MS - 100,
    }
  )

  return {
    data,
    error,
    isLoading,
    isTerminal: isTerminalOrderStatus(data?.status),
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest --config jest.config.cjs tests/hooks/use-order-status.test.ts --forceExit
```

Expected: `PASS — 8 tests, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add hooks/use-order-status.ts tests/hooks/use-order-status.test.ts
git commit -m "feat(hooks): add useOrderStatus polling hook for post-placement status tracking"
```

---

## Task 7: PersistentOrderCard Component

**Files:**
- Create: `components/trading/order-drawer/PersistentOrderCard.tsx`
- Modify: `components/trading/TradingDashboard.tsx` — thread `orderId` + mount card

- [ ] **Step 1: Create PersistentOrderCard.tsx**

```tsx
/**
 * File:        components/trading/order-drawer/PersistentOrderCard.tsx
 * Module:      Trading · Order Drawer · Persistent Order Card
 * Purpose:     Docked bottom card that shows the most recent order's lifecycle
 *              (Pending → Executed / Rejected / Cancelled). Polls via useOrderStatus.
 *
 * Exports:
 *   - PersistentOrderCard(props: PersistentOrderCardProps) — the card; renders null when no order
 *
 * Depends on:
 *   - @/hooks/use-order-status — polling hook
 *   - @/lib/order/rejection-codes — fixable vs hard rejection routing
 *
 * Side-effects: SWR polling via useOrderStatus
 *
 * Key invariants:
 *   - Auto-dismisses 8s after EXECUTED, 4s after CANCELLED
 *   - REJECTED card stays until user taps ✕; "Retry ›" calls onRetry(symbol)
 *   - Renders null when orderId is null or after auto-dismiss
 *
 * Read order:
 *   1. PersistentOrderCardProps
 *   2. PersistentOrderCard
 *
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

"use client"

import React from "react"
import { useOrderStatus } from "@/hooks/use-order-status"
import { resolveRejection } from "@/lib/order/rejection-codes"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

export interface PersistentOrderCardProps {
  orderId: string | null
  /** Symbol + side summary for display before the first status poll returns */
  orderSummary?: {
    symbol: string
    side: "BUY" | "SELL"
    quantity: number
    estimatedTotal?: number
  }
  onRetry?: (symbol: string) => void
  onDismiss?: () => void
}

const AUTO_DISMISS_EXECUTED_MS = 8_000
const AUTO_DISMISS_CANCELLED_MS = 4_000

export function PersistentOrderCard({
  orderId,
  orderSummary,
  onRetry,
  onDismiss,
}: PersistentOrderCardProps) {
  const { data, isLoading } = useOrderStatus(orderId)
  const [dismissed, setDismissed] = React.useState(false)
  const prevOrderIdRef = React.useRef(orderId)

  // Reset dismissed state when a new orderId arrives
  if (orderId !== prevOrderIdRef.current) {
    prevOrderIdRef.current = orderId
    setDismissed(false)
  }

  // Auto-dismiss for terminal success/cancel states
  React.useEffect(() => {
    if (!data) return
    let delay: number | null = null
    if (data.status === "EXECUTED") delay = AUTO_DISMISS_EXECUTED_MS
    if (data.status === "CANCELLED") delay = AUTO_DISMISS_CANCELLED_MS
    if (delay === null) return
    const id = setTimeout(() => {
      setDismissed(true)
      onDismiss?.()
    }, delay)
    return () => clearTimeout(id)
  }, [data?.status, onDismiss])

  if (!orderId || dismissed) return null

  const symbol = data?.symbol ?? orderSummary?.symbol ?? "—"
  const side = orderSummary?.side ?? "BUY"
  const qty = data?.quantity ?? orderSummary?.quantity ?? 0
  const status = data?.status ?? (isLoading ? "PENDING" : "PENDING")

  if (status === "PENDING") {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-emerald-500 bg-emerald-950/95 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
        <div>
          <div className="text-sm font-bold text-emerald-300">
            ⏳ {side} {qty} {symbol} · Pending
          </div>
          {data?.orderId && (
            <div className="text-xs text-zinc-500 mt-0.5">#{data.orderId.slice(-6)}</div>
          )}
        </div>
        <button
          type="button"
          className="text-xs text-emerald-400 hover:text-emerald-200"
          onClick={() => { setDismissed(true); onDismiss?.() }}
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  if (status === "EXECUTED" || status === "PARTIALLY_FILLED") {
    const fillPrice = data?.averagePrice ?? data?.price
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-emerald-500 bg-emerald-950/95 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
        <div>
          <div className="text-sm font-bold text-emerald-300">
            ✓ {side} {qty} {symbol} · Filled
          </div>
          {fillPrice && (
            <div className="text-xs text-zinc-400 mt-0.5">
              @ ₹{fillPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </div>
          )}
        </div>
        <button type="button" className="text-xs text-zinc-500" onClick={() => { setDismissed(true); onDismiss?.() }}>
          <X size={14} />
        </button>
      </div>
    )
  }

  if (status === "REJECTED") {
    const { humanMessage } = resolveRejection(data?.failureCode)
    const reason = data?.failureReason || humanMessage

    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-red-600 bg-red-950/95 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-red-300">✗ {side} {qty} {symbol} — Rejected</div>
          <div className="text-xs text-zinc-400 mt-0.5 truncate">{reason}</div>
        </div>
        <div className="flex items-center gap-3 ml-3 shrink-0">
          {onRetry && (
            <button
              type="button"
              className="text-xs text-red-400 hover:text-red-200 font-medium"
              onClick={() => onRetry(symbol)}
            >
              Retry ›
            </button>
          )}
          <button type="button" className="text-zinc-500 hover:text-zinc-300" onClick={() => { setDismissed(true); onDismiss?.() }}>
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  // CANCELLED / EXPIRED / other
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-700 bg-zinc-950/95 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
      <div className="text-sm text-zinc-400">— {side} {qty} {symbol} · {status}</div>
      <button type="button" className="text-zinc-600" onClick={() => { setDismissed(true); onDismiss?.() }}>
        <X size={14} />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Wire PersistentOrderCard into TradingDashboard**

In `components/trading/TradingDashboard.tsx`:

**2a — Add import** near the WatchlistOrderDrawer import:
```tsx
import { PersistentOrderCard } from "@/components/trading/order-drawer/PersistentOrderCard"
```

**2b — Add `lastOrderId` state** near the other order state (around line 409):
```tsx
const [lastOrderId, setLastOrderId] = React.useState<string | null>(null)
const [lastOrderSummary, setLastOrderSummary] = React.useState<{
  symbol: string
  side: "BUY" | "SELL"
  quantity: number
} | null>(null)
```

**2c — Update `handleOrderPlaced`** to accept an optional orderId. Find the existing `handleOrderPlaced` (around line 586) and extend its signature:

```tsx
// Change the type from () => void to accept optional order metadata
const handleOrderPlaced = useCallback(async (meta?: { orderId?: string; symbol?: string; side?: "BUY" | "SELL"; quantity?: number }) => {
  // ... existing body (refresh portfolio, positions, etc.) unchanged ...
  if (meta?.orderId) {
    setLastOrderId(meta.orderId)
    setLastOrderSummary(meta?.symbol ? { symbol: meta.symbol, side: meta.side ?? "BUY", quantity: meta.quantity ?? 0 } : null)
  }
}, [/* existing deps */])
```

**2d — Mount `PersistentOrderCard`** at the bottom of the returned JSX, just before the closing tag of the outermost div:

```tsx
<PersistentOrderCard
  orderId={lastOrderId}
  orderSummary={lastOrderSummary ?? undefined}
  onRetry={(symbol) => {
    // TODO: find the stock by symbol and open the drawer
    setLastOrderId(null)
  }}
  onDismiss={() => setLastOrderId(null)}
/>
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check 2>&1 | grep -E "PersistentOrderCard|TradingDashboard|handleOrderPlaced" | head -15
```

Fix any type errors. The `handleOrderPlaced` signature change is the most likely source. Callers that pass no args still work because the param is optional.

- [ ] **Step 4: Commit**

```bash
git add components/trading/order-drawer/PersistentOrderCard.tsx components/trading/TradingDashboard.tsx
git commit -m "feat(trading): add PersistentOrderCard — live order status docked at bottom"
```

---

## Task 8: QuickOrderOverlay Component

**Files:**
- Create: `components/trading/order-drawer/QuickOrderOverlay.tsx`
- Modify: `components/trading/order-drawer/WatchlistOrderDrawer.tsx` — mount overlay + emit orderId

- [ ] **Step 1: Create QuickOrderOverlay.tsx**

```tsx
/**
 * File:        components/trading/order-drawer/QuickOrderOverlay.tsx
 * Module:      Trading · Order Drawer · Quick Order Overlay
 * Purpose:     Compact 3-field order entry shown within the peek state (50% snap).
 *              Renders Qty stepper + chips, Market/Limit toggle, and Swipe-to-confirm.
 *              Tapping "Advanced →" calls onAdvanced() to promote to the full OrderScreen.
 *
 * Exports:
 *   - QuickOrderOverlay(props: QuickOrderOverlayProps) — the overlay
 *   - QuickOrderOverlayProps
 *
 * Depends on:
 *   - @/components/trading/order-drawer/SwipeToConfirm — existing swipe button
 *   - @/lib/hooks/use-order-form — placeOrder function pattern
 *   - @/lib/market-data/constants — STALE_PRICE_THRESHOLD_MS
 *
 * Side-effects: POST to /api/trading/orders via placeOrder()
 *
 * Key invariants:
 *   - Market button is disabled when isStale=true — protects against stale price orders
 *   - When isOffline=true the entire swipe button is locked
 *   - lotSize defaults to 1 for equity; caller must provide correct lot size for F&O
 *
 * Read order:
 *   1. QuickOrderOverlayProps
 *   2. QuickOrderOverlay
 *
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { Minus, Plus } from "lucide-react"
import { SwipeToConfirm } from "./SwipeToConfirm"
import { placeOrder } from "@/lib/hooks/use-trading-data"
import { useFeedStatus } from "@/lib/market-data/hooks/useFeedStatus"

export interface QuickOrderOverlayProps {
  symbol: string
  instrumentId?: string | null
  token?: number | null
  exchange?: string | null
  segment?: string | null
  direction: "BUY" | "SELL"
  feedPrice: number
  feedPriceTimestamp?: number | null
  availableMargin: number
  lotSize?: number
  /** Called with the placed orderId on successful placement */
  onPlaced: (meta: { orderId: string; symbol: string; side: "BUY" | "SELL"; quantity: number }) => void
  /** User tapped "Advanced →" — caller promotes to full OrderScreen */
  onAdvanced: () => void
  session?: any
  tradingAccountId?: string
}

function computeMaxQty(price: number, margin: number, lotSize: number): number {
  if (price <= 0 || margin <= 0) return 0
  return Math.floor(Math.floor(margin / price) / lotSize) * lotSize
}

export function QuickOrderOverlay({
  symbol,
  instrumentId,
  token,
  exchange,
  segment,
  direction,
  feedPrice,
  availableMargin,
  lotSize = 1,
  onPlaced,
  onAdvanced,
  session,
  tradingAccountId,
}: QuickOrderOverlayProps) {
  const [qty, setQty] = React.useState(lotSize)
  const [orderType, setOrderType] = React.useState<"MARKET" | "LIMIT">("MARKET")
  const [limitPrice, setLimitPrice] = React.useState(feedPrice)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const { status: feedStatus } = useFeedStatus()
  // DEGRADED = reconnecting within 30s grace window — market orders still allowed in that state
  const isStale = feedStatus === "STALE" || feedStatus === "OFFLINE"
  const isOffline = feedStatus === "OFFLINE"

  const maxQty = computeMaxQty(feedPrice, availableMargin, lotSize)
  const halfQty = Math.max(lotSize, Math.floor((maxQty / 2 / lotSize)) * lotSize)

  const price = orderType === "MARKET" ? feedPrice : limitPrice
  const estimatedTotal = qty * price

  const handleQtyChip = (chipQty: number) => {
    if (chipQty > 0) setQty(chipQty)
  }

  const handleSwipe = async () => {
    if (isSubmitting || isOffline) return
    if (orderType === "MARKET" && isStale) {
      setError("Feed is stale — switch to Limit or wait for reconnect")
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await placeOrder({
        symbol,
        instrumentId,
        token,
        exchange,
        segment,
        quantity: qty,
        price: orderType === "LIMIT" ? limitPrice : null,
        orderType: orderType === "MARKET" ? "MARKET" : "LIMIT",
        orderSide: direction,
        productType: "CNC",
        tradingAccountId,
        session,
      })
      if (result?.orderId) {
        onPlaced({ orderId: result.orderId, symbol, side: direction, quantity: qty })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed — try again")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isBuy = direction === "BUY"

  return (
    <div className="px-4 pt-3 pb-4 bg-zinc-950 border-t-2 border-zinc-800 space-y-3">
      {/* Error banner */}
      {error && (
        <div className="text-xs text-red-400 bg-red-950/50 rounded px-3 py-1.5 border border-red-900">
          {error}
        </div>
      )}

      {/* Order type toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOrderType("MARKET")}
          disabled={isStale}
          className={cn(
            "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
            orderType === "MARKET" && !isStale
              ? "bg-blue-900 border border-blue-600 text-blue-300"
              : "bg-zinc-900 border border-zinc-700 text-zinc-500",
            isStale && "line-through opacity-40 cursor-not-allowed"
          )}
        >
          Market{isStale ? " (stale)" : ""}
        </button>
        <button
          type="button"
          onClick={() => setOrderType("LIMIT")}
          className={cn(
            "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
            orderType === "LIMIT"
              ? "bg-blue-900 border border-blue-600 text-blue-300"
              : "bg-zinc-900 border border-zinc-700 text-zinc-500"
          )}
        >
          Limit
        </button>
      </div>

      {/* Limit price stepper */}
      {orderType === "LIMIT" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-400"
            onClick={() => setLimitPrice((p) => Math.max(0.05, Number((p - 0.05).toFixed(2))))}
          >
            <Minus size={12} />
          </button>
          <div className="flex-1 bg-zinc-900 border border-blue-700 rounded-lg py-1.5 text-center text-sm font-bold text-white tabular-nums">
            ₹{limitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <button
            type="button"
            className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-400"
            onClick={() => setLimitPrice((p) => Number((p + 0.05).toFixed(2)))}
          >
            <Plus size={12} />
          </button>
        </div>
      )}

      {/* Quantity row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-400"
          onClick={() => setQty((q) => Math.max(lotSize, q - lotSize))}
        >
          <Minus size={12} />
        </button>
        <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg py-1.5 text-center text-sm font-bold text-white tabular-nums">
          {qty}
        </div>
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-400"
          onClick={() => setQty((q) => q + lotSize)}
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Quick qty chips */}
      <div className="flex gap-2">
        {[
          { label: "Max", qty: maxQty },
          { label: "½ cap", qty: halfQty },
          { label: "1 lot", qty: lotSize },
        ].map(({ label, qty: chipQty }) => (
          <button
            key={label}
            type="button"
            disabled={chipQty <= 0}
            onClick={() => handleQtyChip(chipQty)}
            className="flex-1 flex flex-col items-center rounded-md bg-zinc-900 border border-zinc-700 py-1 text-[10px] text-zinc-500 disabled:opacity-30"
          >
            <span>{label}</span>
            <span className="text-white font-bold text-xs">{chipQty > 0 ? chipQty : "—"}</span>
          </button>
        ))}
      </div>

      {/* Estimated total */}
      <div className="text-xs text-zinc-500 text-right tabular-nums">
        ≈ ₹{estimatedTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })} ·{" "}
        <span className="text-zinc-600">
          ₹{availableMargin.toLocaleString("en-IN", { maximumFractionDigits: 0 })} available
        </span>
      </div>

      {/* Swipe to confirm */}
      {/* SwipeToConfirmProps: { side, label?, threshold?, disabled?, busy?, onConfirm } — no variant/isLoading */}
      <SwipeToConfirm
        side={direction}
        label={`Swipe to ${direction} · ₹${estimatedTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
        onConfirm={handleSwipe}
        disabled={isOffline || isSubmitting || qty <= 0}
        busy={isSubmitting}
      />

      {/* Promote to full form */}
      <button
        type="button"
        onClick={onAdvanced}
        className="w-full text-center text-xs text-zinc-600 hover:text-zinc-400 py-1"
      >
        Advanced options ↓
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check passes on QuickOrderOverlay**

The `SwipeToConfirm` props were pre-verified: `{ side: "BUY" | "SELL", label?, threshold?, disabled?, busy?, onConfirm }`. No `variant` or `isLoading` — the code above already uses the correct shape. Confirm no type errors:

```bash
npm run type-check 2>&1 | grep "QuickOrderOverlay" | head -10
```

Expected: no errors.

- [ ] **Step 3: Wire QuickOrderOverlay into WatchlistOrderDrawer**

In `components/trading/order-drawer/WatchlistOrderDrawer.tsx`, make these changes:

**3a — Add import:**
```tsx
import { QuickOrderOverlay } from "./QuickOrderOverlay"
```

**3b — Add `quickOrderDirection` state** (what triggered the quick order — or null to show normal peek):
```tsx
const [quickOrderDirection, setQuickOrderDirection] = React.useState<"BUY" | "SELL" | null>(null)
```

**3c — Pass new handlers to `DrawerPeekActions`:**

Find where `DrawerPeekActions` is rendered. Change:
```tsx
<DrawerPeekActions
  onBuy={() => setStage("order")}
  onSell={() => setStage("order")}
  ...
/>
```
To:
```tsx
<DrawerPeekActions
  onBuy={() => setQuickOrderDirection("BUY")}
  onSell={() => setQuickOrderDirection("SELL")}
  ...
/>
```

**3d — Mount `QuickOrderOverlay` conditionally:**

Inside the peek snap content area, after `DrawerPeekActions`, add:
```tsx
{quickOrderDirection !== null && (
  <QuickOrderOverlay
    symbol={stock?.symbol ?? ""}
    instrumentId={stock?.instrumentId ?? null}
    token={stock?.token ?? null}
    exchange={stock?.exchange ?? null}
    segment={stock?.segment ?? null}
    direction={quickOrderDirection}
    feedPrice={currentQuote?.display_price ?? stock?.ltp ?? 0}
    feedPriceTimestamp={currentQuote?.lastUpdateTime ?? null}
    availableMargin={portfolio?.account?.availableMargin ?? 0}
    lotSize={stock?.lotSize ?? 1}
    onPlaced={(meta) => {
      setQuickOrderDirection(null)
      onOrderPlaced(meta)          // pass meta up to TradingDashboard
    }}
    onAdvanced={() => {
      setQuickOrderDirection(null)
      setStage("order")
    }}
    session={session}
    tradingAccountId={portfolio?.account?.id}
  />
)}
```

**3e — Update `onOrderPlaced` prop signature** in `WatchlistOrderDrawerProps`:
```tsx
// Change from:
onOrderPlaced: () => void
// To:
onOrderPlaced: (meta?: { orderId?: string; symbol?: string; side?: "BUY" | "SELL"; quantity?: number }) => void
```

- [ ] **Step 4: Type-check**

```bash
cd tradingpro-platform && npm run type-check 2>&1 | grep -E "QuickOrder|WatchlistOrderDrawer|PersistentOrderCard" | head -20
```

Fix all type errors before continuing.

- [ ] **Step 5: Commit**

```bash
git add components/trading/order-drawer/QuickOrderOverlay.tsx \
        components/trading/order-drawer/WatchlistOrderDrawer.tsx
git commit -m "feat(order-drawer): add QuickOrderOverlay — compact 3-field order from peek state"
```

---

## Task 9: Wire Market Order Guard into Order Screen

**Files:**
- Modify: `components/trading/order-drawer/OrderScreen.tsx` — disable market type when feed is STALE/OFFLINE

- [ ] **Step 1: Add feed status guard to OrderScreen**

In `components/trading/order-drawer/OrderScreen.tsx`, add the import:
```tsx
import { useFeedStatus } from "@/lib/market-data/hooks/useFeedStatus"
```

Inside the component body, add:
```tsx
const { status: feedStatus } = useFeedStatus()
// DEGRADED = reconnecting within 30s grace window — market orders still allowed
  const marketOrderBlocked = feedStatus === "STALE" || feedStatus === "OFFLINE"
```

Find the Market order type radio/toggle button (search for `"MARKET"` in the file). Add `disabled={marketOrderBlocked}` to it, plus a tooltip/label when blocked:

```tsx
{/* Market order type option */}
<button
  type="button"
  onClick={() => !marketOrderBlocked && handleOrderTypeChange("MARKET")}
  disabled={marketOrderBlocked}
  className={cn(
    "...",
    marketOrderBlocked && "opacity-40 cursor-not-allowed line-through"
  )}
>
  Market
  {marketOrderBlocked && <span className="text-[9px] text-amber-500 ml-1">(stale)</span>}
</button>
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check 2>&1 | grep "OrderScreen" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add components/trading/order-drawer/OrderScreen.tsx
git commit -m "feat(order-screen): block market orders when feed is STALE or OFFLINE"
```

---

## Task 10: Mirror to TradeBazaar + Final Push

- [ ] **Step 1: Run type-check + lint**

```bash
cd tradingpro-platform && npm run type-check 2>&1 | tail -5
```

Expected: 0 new errors introduced by this feature.

- [ ] **Step 2: Mirror all changed files to TradeBazaar**

Note: Test files (`tests/`) are NOT mirrored — they only live in tradingpro-platform.

```bash
# From repo root:
cp tradingpro-platform/lib/market-data/constants.ts TradeBazaar/lib/market-data/constants.ts
cp tradingpro-platform/lib/order/rejection-codes.ts TradeBazaar/lib/order/rejection-codes.ts
cp tradingpro-platform/lib/market-data/hooks/useFeedStatus.ts TradeBazaar/lib/market-data/hooks/useFeedStatus.ts
cp tradingpro-platform/hooks/use-order-status.ts TradeBazaar/hooks/use-order-status.ts
cp tradingpro-platform/components/trading/FeedStatusBanner.tsx TradeBazaar/components/trading/FeedStatusBanner.tsx
cp tradingpro-platform/components/trading/order-drawer/PersistentOrderCard.tsx TradeBazaar/components/trading/order-drawer/PersistentOrderCard.tsx
cp tradingpro-platform/components/trading/order-drawer/QuickOrderOverlay.tsx TradeBazaar/components/trading/order-drawer/QuickOrderOverlay.tsx
cp tradingpro-platform/components/watchlist/WatchlistItemCard.tsx TradeBazaar/components/watchlist/WatchlistItemCard.tsx
cp tradingpro-platform/components/trading/order-drawer/WatchlistOrderDrawer.tsx TradeBazaar/components/trading/order-drawer/WatchlistOrderDrawer.tsx
cp tradingpro-platform/components/trading/TradingDashboard.tsx TradeBazaar/components/trading/TradingDashboard.tsx
cp tradingpro-platform/app/globals.css TradeBazaar/app/globals.css
```

- [ ] **Step 3: Commit mirror**

```bash
cd TradeBazaar
git add lib/market-data/constants.ts lib/order/rejection-codes.ts \
  lib/market-data/hooks/useFeedStatus.ts hooks/use-order-status.ts \
  components/trading/FeedStatusBanner.tsx \
  components/trading/order-drawer/PersistentOrderCard.tsx \
  components/trading/order-drawer/QuickOrderOverlay.tsx \
  components/watchlist/WatchlistItemCard.tsx \
  components/trading/order-drawer/WatchlistOrderDrawer.tsx \
  components/trading/TradingDashboard.tsx app/globals.css
git commit -m "mirror(order-ux): watchlist order robustness & UX [from tradingpro-platform]"
cd ..
```

- [ ] **Step 4: Push both**

```bash
cd tradingpro-platform && git pull --rebase && git push
cd ../TradeBazaar && git pull --rebase && git push
git status
```

---

## Manual E2E Test Checklist

Run after implementation is complete:

- [ ] Open watchlist → tap any stock → peek drawer appears
- [ ] Tap Buy in peek → `QuickOrderOverlay` slides up within the peek card (drawer does NOT expand)
- [ ] Tap "½ cap" chip → qty updates instantly
- [ ] Toggle Market → Limit → price stepper appears with +/- buttons
- [ ] Swipe to confirm → `PersistentOrderCard` appears at bottom showing Pending
- [ ] Wait ~2s → card updates to Executed (green) and auto-dismisses after 8s
- [ ] Simulate stale feed: disconnect network → amber `FeedStatusBanner` appears at top
- [ ] With stale feed: open quick order → Market button is disabled/struck-out
- [ ] With stale feed: full OrderScreen → Market order type is disabled
- [ ] Reconnect: banner shows "✓ Live feed restored" for 1.5s then disappears
- [ ] Submit order that will be rejected → red card appears with rejection reason + Retry button
- [ ] Tap Retry → quick order re-opens pre-pointed at same stock
- [ ] Tap Advanced from quick order → full `OrderScreen` opens (stage = "order")
- [ ] Place order with Limit → stepper moves by 0.05 per tap
- [ ] WatchlistItemCard: create an uptick condition → green flash visible for ~400ms
- [ ] WatchlistItemCard: stock with stale price (>30s no tick) → dims to ~45% opacity with age label
