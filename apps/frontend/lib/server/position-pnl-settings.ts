/**
 * File: lib/server/position-pnl-settings.ts
 * Module: trading
 * Purpose: Resolve server-side position PnL mode + worker heartbeat health from SystemSettings.
 * Author: StockTrade
 * Last-updated: 2026-02-04
 * Notes:
 * - Defaults to client mode for Vercel/serverless safety.
 * - Worker health is inferred from `positions_pnl_worker_heartbeat.lastRunAtIso`.
 */

import { prisma } from "@/lib/prisma"

export const POSITION_PNL_MODE_KEY = "position_pnl_mode" as const
export const POSITION_PNL_WORKER_HEARTBEAT_KEY = "positions_pnl_worker_heartbeat" as const
export const POSITION_PNL_SETTINGS_CATEGORY = "TRADING" as const

export type PositionPnLMode = "client" | "server"

export type PositionPnLWorkerHeartbeat = {
  lastRunAtIso: string
  host?: string
  pid?: number
  scanned?: number
  updated?: number
  skipped?: number
  errors?: number
  elapsedMs?: number
}

export type PositionPnLSettingsResolution = {
  mode: PositionPnLMode
  workerHealthy: boolean
  heartbeat: PositionPnLWorkerHeartbeat | null
  source: "db" | "default_client" | "error_default_client"
}

const CACHE_TTL_MS = 5000
let cached: { resolution: PositionPnLSettingsResolution; fetchedAt: number } | null = null

function parseMode(v: string | null | undefined): PositionPnLMode {
  return v === "server" ? "server" : "client"
}

function parseHeartbeat(v: string | null | undefined): PositionPnLWorkerHeartbeat | null {
  if (!v) return null
  try {
    const parsed = JSON.parse(v)
    if (!parsed || typeof parsed !== "object") return null
    if (typeof (parsed as any).lastRunAtIso !== "string") return null
    return parsed as PositionPnLWorkerHeartbeat
  } catch {
    return null
  }
}

export function isPositionPnLWorkerHealthy(hb: PositionPnLWorkerHeartbeat | null, nowMs: number): boolean {
  if (!hb?.lastRunAtIso) return false
  const t = Date.parse(hb.lastRunAtIso)
  if (!Number.isFinite(t) || t <= 0) return false
  return nowMs - t < 2 * 60 * 1000 // 2 minutes freshness window
}

export async function getPositionPnLSettings(): Promise<PositionPnLSettingsResolution> {
  const now = Date.now()
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.resolution
  }

  try {
    const [modeSetting, heartbeatSetting] = await Promise.all([
      prisma.systemSettings.findFirst({
        where: { ownerId: null, key: POSITION_PNL_MODE_KEY, isActive: true },
        orderBy: { updatedAt: "desc" },
        select: { value: true },
      }),
      prisma.systemSettings.findFirst({
        where: { ownerId: null, key: POSITION_PNL_WORKER_HEARTBEAT_KEY, isActive: true },
        orderBy: { updatedAt: "desc" },
        select: { value: true },
      }),
    ])

    const mode = parseMode(modeSetting?.value)
    const heartbeat = parseHeartbeat(heartbeatSetting?.value)
    const workerHealthy = isPositionPnLWorkerHealthy(heartbeat, now)

    const resolution: PositionPnLSettingsResolution = {
      mode,
      heartbeat,
      workerHealthy,
      source: "db",
    }

    cached = { resolution, fetchedAt: now }
    return resolution
  } catch (error) {
    console.error("[PositionPnLSettings] Failed to read settings; defaulting to client mode", error)
    const resolution: PositionPnLSettingsResolution = {
      mode: "client",
      heartbeat: null,
      workerHealthy: false,
      source: "error_default_client",
    }
    cached = { resolution, fetchedAt: now }
    return resolution
  }
}

export function invalidatePositionPnLSettingsCache(): void {
  cached = null
}

