# Watchlist → Order Flow: Robustness & UX Design Spec

**Date:** 2026-05-09  
**Author:** Aman + Claude (learning mode)  
**Status:** Approved — ready for implementation planning  
**Companion spec:** `2026-05-07-realtime-stability-design.md` (WS internals)

---

## Problem Statement

The trading flow between watchlist and order execution has several friction points and silent failure modes:

1. **Order entry is slow** — tap stock → peek drawer → drag up → tap Buy → full form → fill fields → swipe. Too many steps for a market order.
2. **Price ticks have no visual feedback** — users can't tell if a price just moved or has been stale for 30 seconds.
3. **Order outcomes are ambiguous** — success briefly toasts then vanishes; rejections are a red toast that disappears without action items.
4. **Feed disconnection is invisible** — WebSocket drops leave prices stale with no warning; users may execute market orders on minutes-old data.

---

## Out of Scope

- Order book / Level 2 depth (separate feature).
- Charting within the drawer (existing dedicated chart screen).
- Push notifications for fills when app is in background.
- Changes to the server-side execution logic (this spec is client UX only).

---

## Area 1 — Watchlist → Order Flow

### Decision: 3-Mode Drawer + Quick Order from Peek

The bottom sheet (`Vaul`) retains its existing 3 snap points but gains a compact **Quick Order overlay** that activates from the peek state.

#### Drawer states

| State | Snap | Contents |
|-------|------|----------|
| **Peek** | 50 % | Stock header (name, price, change). Buy/Sell buttons surface directly here. |
| **Expanded** | 95 % | + Market depth / OHLC summary. Full order form accessible via "Full Form" tab. |
| **Full Order** | Full screen | Existing `OrderScreen` with all fields (segment, product, qty, price, validity, triggers). |

#### Quick Order overlay (new)

Activating Buy or Sell from the **peek state** does NOT expand the drawer. Instead, a compact overlay slides up within the peek card with only 3 inputs:

- **Quantity row**: `−` / numeric display / `+` stepper + 3 chips (Max / ½ cap / 1 lot). Tapping a chip sets qty instantly.
- **Order type toggle**: Market ↔ Limit. Market is default. Limit reveals a price stepper (tick-step for the segment: 0.05 for NSE equities, 0.025 for currency, 1 for commodity).
- **Swipe-to-confirm button**: color-keyed (green = Buy, red = Sell), shows estimated total.

Tapping **"Advanced →"** promotes to the full order screen without losing the symbol context.

#### Price tick stepper (limit orders)

When Limit is selected, a `+`/`−` stepper replaces the keyboard input. Each tap moves by 1 tick. Long-press accelerates. Bid / LTP / Ask shown as reference anchors below the field. Eliminates fat-finger decimal errors on mobile.

#### Component boundaries

- New: `QuickOrderOverlay` — self-contained; receives `symbol`, `direction`, `feedPrice`, `availableMargin`; emits `onPlaced(orderId)` or `onAdvanced()`.
- Modified: `WatchlistRow` — adds Buy/Sell tap targets visible in peek state.
- Modified: `OrderDrawer` — mounts `QuickOrderOverlay` conditionally on `mode === "peek" && orderDirection !== null`.

---

## Area 2 — Live Price Feel

### Decision: Flash & Fade + Staleness Dimming

#### Tick flash

On every new tick from the WebSocket feed:

- **Uptick** (price > last): row background flashes `#14532d` → transparent over 400 ms (`ease-out`).
- **Downtick** (price < last): row background flashes `#450a0a` → transparent over 400 ms (`ease-out`).
- **Unchanged** (price === last): no flash.

Implementation: CSS keyframe animation triggered by toggling a data attribute (`data-tick="up"` / `"down"` / `""`) on the row element. React does not re-render the entire row on every tick — the hook updates only the DOM attribute.

#### Staleness dimming

When a symbol's last tick is **> 30 seconds** old:

- Row opacity drops to 45 %.
- Price value shows stale age: `₹2,847.50 (42s)`.
- Market order is **disabled** in both Quick Order overlay and full order screen for this symbol.
- Limit order remains available (user sets their own price).

When feed recovers and a fresh tick arrives:
- Opacity restores to 100 % immediately.
- Stale age label disappears.
- Market order re-enables.

This dimming logic lives in `useMarketData` (already per-symbol); the 30 s threshold is a constant `STALE_PRICE_THRESHOLD_MS = 30_000` in `lib/market-data/constants.ts`.

---

## Area 3 — Order Status & Feedback

### Decision: Persistent Bottom Card (all outcomes)

A single persistent card docks to the bottom of the watchlist screen for the **lifetime of the last order**. It handles all states:

| State | Card appearance |
|-------|----------------|
| **Pending** | Green top border, `⏳ BUY 10 RELIANCE · Pending`, order ID + estimated value. "View ›" opens order detail. |
| **Executed** | Green top border, `✓ BUY 10 RELIANCE · Filled`, fill price + time. Auto-dismisses after 8 s. |
| **Rejected** | Red top border, `✗ BUY 10 RELIANCE — Rejected`, exact rejection reason on second line. "Retry ›" reopens order screen pre-filled. `✕` to dismiss. |
| **Cancelled** | Gray border, `— BUY 10 RELIANCE · Cancelled`. Auto-dismisses after 4 s. |

Status transitions (Pending → Executed / Rejected) happen **live via the existing WebSocket order update stream** — no polling.

The card survives navigation within the app (watchlist ↔ portfolio ↔ funds) but is dismissed on hard app close/background.

Multiple orders in the same session: the card shows the **most recent** order. A "2 more ›" counter appears when prior unacknowledged orders exist.

#### Smart routing for rejections

- **Fixable** (insufficient margin, qty out of range, price outside circuit): Retry opens quick order or full order pre-filled, with the exact constraint displayed inline: `"Reduce qty — need ₹28,475, have ₹12,300. Try 4?"`.
- **Hard reject** (market closed, segment disabled, risk limit, exchange reject): Red card only; no retry prompt (retrying would fail again immediately).

The classification of fixable vs. hard is done client-side based on the `rejectionCode` returned by the order API. A lookup table maps codes to `{ fixable: boolean, humanMessage: string }`.

---

## Area 4 — Robustness & Edge Cases

### Decision: Smart Recovery Stack

This area is the **UX surface** for the WebSocket internals documented in `2026-05-07-realtime-stability-design.md`. This spec does not change reconnection logic — it defines what users see at each degradation level.

#### State machine

```
LIVE → DEGRADED (WS reconnecting, within 30s grace) → STALE (WS down >30s) → OFFLINE (network gone)
     ← LIVE (WS reconnects, "Live ✓" flash)
```

Note: No REST price fallback is included in this spec. DEGRADED is a grace window before staleness, not a separate data source.

#### Per-state UI

| State | Banner | Prices | Order screen |
|-------|--------|--------|-------------|
| **LIVE** | None | Ticking normally | All order types available |
| **DEGRADED** | Amber slim bar: `⚡ Reconnecting… prices may be delayed`. Age counter shows seconds since disconnect. | Visible (last known price) | Market orders **still allowed** during grace window |
| **STALE** (WS down >30s) | Amber bar: `⚡ Feed paused (42s) — market orders disabled`. | Dim at 45% opacity with stale age | Market orders **disabled**; limit orders allowed |
| **OFFLINE** | Red bar: `✗ No connection — trading paused` | Last known prices, fully dimmed | Entire order screen locked (swipe button disabled + tooltip) |

#### Recovery behaviors

- **WS drop**: Auto-reconnect every **3 s** (already in `2026-05-07` spec). Banner appears immediately. If reconnect happens within 30 s, market orders remain available (DEGRADED grace window).
- **WS down >30 s**: State escalates to STALE. Market orders disabled.
- **WS reconnects**: Banner slides out. `"Live ✓"` flash (green, 1.5 s) replaces it. Prices resume ticking. Market orders re-enable.
- **Market closed (per venue)**: Banner shows venue-specific message:
  - NSE/BSE equities: `"NSE closed — next session 09:15 IST Mon–Fri"`
  - MCX/NCO commodity: `"MCX closed — next session 09:00 IST"`
  - CDS/BCD currency: `"CDS closed — next session 09:00 IST"`
  - CRYPTO: never closed (no banner)
  - These use the existing `getSegmentMarketSession()` client function fixed in the prior bug pass.

#### Components

- `FeedStatusBanner` — new component, docks at top of watchlist. Subscribes to a `useFeedStatus()` hook.
- `useFeedStatus()` — new hook, derives state from `WebSocketMarketDataProvider` context (isConnected, disconnectedSince) + `navigator.onLine`.
- No changes to `WebSocketMarketDataProvider` internals (owned by the companion spec).

---

## Data Flow Summary

```
WebSocket tick
  → WebSocketMarketDataProvider (existing)
      → per-symbol lastTickAt + price
          → useMarketData() per symbol
              → WatchlistRow: flash animation + stale dim
              → QuickOrderOverlay: stale guard on market button
          → useFeedStatus() (new)
              → FeedStatusBanner (new)
              → OrderScreen: disable market type if STALE/OFFLINE

Order placed
  → OrderExecutionService (existing, server)
      → WS order update stream
          → useOrderStatus() (existing or new)
              → PersistentOrderCard (new)
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Quick Order submit with stale price | Blocked client-side before API call; amber tooltip on swipe button |
| Offline at submit moment | Swipe button locked; `"No connection"` message |
| Quick Order API timeout (> 5 s) | Swipe button returns to un-swiped state; inline error: `"Request timed out — check connection"` |
| WS order update never arrives (> 15 s after Pending) | Card shows `"Status unknown — check Orders tab"` |
| Rejection code not in lookup table | Default to fixable=false, generic message: `"Order rejected by exchange"` |

---

## Testing Requirements

- **Unit**: `useFeedStatus` — all 4 state transitions; DEGRADED grace window (disconnectedMs 29 999 → DEGRADED, 30 000 → STALE); OFFLINE overrides WS state.
- **Unit**: `QuickOrderOverlay` — qty chip calculations (max affordable, half-cap rounding, lot size); market button disabled when `feedStale`.
- **Unit**: Rejection code lookup — fixable vs. hard; unknown code fallback.
- **Integration**: `PersistentOrderCard` — Pending → Executed transition via mock WS event; Pending → Rejected with retry action.
- **E2E (manual)**: Quick Order full flow (peek → qty chip → swipe → card shows Pending → card shows Executed). Disconnect WS → amber banner → reconnect → "Live ✓" flash.

---

## Non-Goals (explicitly excluded)

- Storing order history locally (IndexedDB / localStorage).
- Push notifications for background fills.
- Animated price chart within the drawer peek state.
- Any change to the server execution pipeline.
- GTT (Good-Till-Triggered) orders in the Quick Order overlay — Advanced only.
