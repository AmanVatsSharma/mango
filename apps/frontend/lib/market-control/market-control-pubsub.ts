/**
 * File:        apps/frontend/lib/market-control/market-control-pubsub.ts
 * Module:      Market control pub/sub stub
 * Purpose:     Market control state for the trading terminal.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-18
 */

export interface MarketControlState {
  isMarketOpen: boolean
  sessionType: string
  message?: string
}

export function subscribeMarketControl(_callback: (state: MarketControlState) => void) {
  return () => {}
}
