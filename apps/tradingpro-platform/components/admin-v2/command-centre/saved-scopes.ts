/**
 * @file components/admin-v2/command-centre/saved-scopes.ts
 * @module admin-v2/command-centre
 * @description LocalStorage-backed saved filter scopes for the Command Centre. Keyed per user
 *              (the AdminSession user id) so scopes don't bleed across operators sharing a browser.
 *              Phase 8+ may promote to a Prisma model — same shape, just swap the storage.
 *
 *              Exports: loadScopes, saveScopes, addScope, removeScope.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import type { SavedScope, TradesFilters } from "./types"

function key(userId: string): string {
  return `v2.cc.scopes.${userId}`
}

export function loadScopes(userId: string): SavedScope[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(key(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedScope[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

export function saveScopes(userId: string, scopes: SavedScope[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(scopes))
  } catch {
    // quota exceeded → silent
  }
}

export function addScope(userId: string, label: string, filters: TradesFilters): SavedScope {
  const scope: SavedScope = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    filters,
    createdAt: Date.now(),
  }
  const all = loadScopes(userId)
  saveScopes(userId, [scope, ...all].slice(0, 20))
  return scope
}

export function removeScope(userId: string, scopeId: string): void {
  const all = loadScopes(userId).filter((s) => s.id !== scopeId)
  saveScopes(userId, all)
}
