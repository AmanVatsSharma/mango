/**
 * File:        lib/market-data/constants.ts
 * Module:      Market Data · Constants
 * Purpose:     Shared numeric thresholds for price staleness and feed-status escalation.
 *
 * Exports:
 *   - STALE_PRICE_THRESHOLD_MS — ms after which a quote is considered stale (used in WatchlistItemCard)
 *   - FEED_DEGRADED_ESCALATION_MS — ms of WS disconnection before status escalates from DEGRADED to STALE
 *   - ORDER_POLL_INTERVAL_MS — SWR refetch interval for order status polling
 *   - ORDER_POLL_MAX_DURATION_MS — stop polling after this many ms
 *
 * Depends on: none
 * Side-effects: none
 * Key invariants:
 *   - STALE_PRICE_THRESHOLD_MS and FEED_DEGRADED_ESCALATION_MS are both 30s — intentional.
 *     A quote is stale when its own lastUpdateTime is >30s old; the feed escalates to STALE
 *     when the WS has been disconnected for >30s. These are independent thresholds that happen
 *     to share the same value.
 * Read order: top to bottom
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

export const STALE_PRICE_THRESHOLD_MS = 30_000
export const FEED_DEGRADED_ESCALATION_MS = 30_000
export const ORDER_POLL_INTERVAL_MS = 2_000
export const ORDER_POLL_MAX_DURATION_MS = 60_000
