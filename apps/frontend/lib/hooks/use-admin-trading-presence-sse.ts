/**
 * @file use-admin-trading-presence-sse.ts
 * @module lib/hooks
 * @description Subscribes to admin presence SSE (trading dashboard online/offline deltas + snapshot).
 * @author StockTrade
 * @created 2026-04-03
 *
 * Notes:
 * - Uses EventSource + session cookie; falls back to API fields when no live entry for a userId.
 */

"use client"

import { useEffect, useState } from "react"

type SnapshotMsg = { event: "snapshot"; data: { map: Record<string, boolean> } }
type PresenceMsg = { event: "presence"; data: { userId: string; online: boolean } }

export function useAdminTradingPresenceStream(userIds: string[], enabled: boolean): Record<string, boolean> {
  const [livePresence, setLivePresence] = useState<Record<string, boolean>>({})

  const idsKey = Array.from(new Set(userIds)).filter(Boolean).slice(0, 500).sort().join(",")

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return
    }

    const qs = idsKey ? `?ids=${encodeURIComponent(idsKey)}` : ""
    const es = new EventSource(`/api/admin/presence/stream${qs}`)

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as SnapshotMsg | PresenceMsg
        if (msg.event === "snapshot" && msg.data && "map" in msg.data) {
          const m = msg.data.map
          setLivePresence((prev) => {
            const next = { ...prev }
            for (const [k, v] of Object.entries(m)) {
              next[k] = Boolean(v)
            }
            return next
          })
        }
        if (msg.event === "presence" && msg.data && "userId" in msg.data) {
          const { userId, online } = msg.data
          setLivePresence((prev) => ({ ...prev, [userId]: online }))
        }
      } catch {
        /* ignore malformed */
      }
    }

    es.onerror = () => {
      es.close()
    }

    return () => {
      es.close()
    }
  }, [enabled, idsKey])

  return livePresence
}
