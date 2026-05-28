/**
 * File:        lib/hooks/use-active-account-id.ts
 * Module:      Trading · Account Switching
 * Purpose:     Read the currently-active trading account ID from localStorage.
 *              Used by the realtime provider to fetch the correct account
 *              when the user switches between LIVE and DEMO.
 *
 * Exports:
 *   - useActiveAccountId() → string | null
 *
 * Depends on:
 *   - React (useState, useEffect) — client-side only
 *
 * Side-effects:
 *   - Reads from localStorage key "active_account_id"
 *
 * Key invariants:
 *   - Returns null during SSR; populated after mount
 *   - Key must match AccountSwitcher.LOCAL_STORAGE_KEY exactly
 *
 * Read order:
 *   1. useActiveAccountId — hook
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-15
 */

"use client"

import { useEffect, useState } from "react"

const LOCAL_STORAGE_KEY = "active_account_id"

export function useActiveAccountId(): string | null {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (stored) {
      setActiveId(stored)
    }
  }, [])

  return activeId
}