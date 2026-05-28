/**
 * File:        components/trading/order-drawer/index.ts
 * Module:      Trading · Watchlist Order Drawer
 * Purpose:     Barrel exports for the Kite-inspired watchlist→order drawer module.
 *
 * Exports:
 *   - WatchlistOrderDrawer (default + named) — orchestrator
 *   - WatchlistOrderDrawerProps
 *   - DrawerStockHeader, DrawerPeekActions, DrawerMarketDepth, OrderScreen, SwipeToConfirm — for testing / power use
 *
 * Depends on: nothing (re-exports only)
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - This is the only file outside this folder that callers should import from. Sub-components are
 *     re-exported for tests and advanced composition; for normal use, import { WatchlistOrderDrawer }.
 *
 * Read order:
 *   1. WatchlistOrderDrawer — the typical entry point
 *
 * Author:      Aman Sharma
 * Last-updated: 2026-04-29
 */

export { WatchlistOrderDrawer, default } from "./WatchlistOrderDrawer"
export type { WatchlistOrderDrawerProps } from "./WatchlistOrderDrawer"
export { DrawerStockHeader } from "./DrawerStockHeader"
export type { DrawerStockHeaderProps } from "./DrawerStockHeader"
export { DrawerPeekActions } from "./DrawerPeekActions"
export type { DrawerPeekActionsProps } from "./DrawerPeekActions"
export { DrawerMarketDepth } from "./DrawerMarketDepth"
export type { DrawerMarketDepthProps, DepthLevel } from "./DrawerMarketDepth"
export { OrderScreen } from "./OrderScreen"
export type { OrderScreenProps } from "./OrderScreen"
export { SwipeToConfirm } from "./SwipeToConfirm"
export type { SwipeToConfirmProps } from "./SwipeToConfirm"
