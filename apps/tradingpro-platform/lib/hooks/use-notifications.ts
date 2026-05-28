/**
 * File:        lib/hooks/use-notifications.ts
 * Module:      Notifications · Realtime Hook
 * Purpose:     SSE-driven notifications feed; mutates SWR cache on `notification_created` events. No periodic polling.
 *
 * Exports:
 *   - useNotifications(userId) → { notifications, unreadCount, isLoading, error, refresh, markAsRead, markAsUnread }
 *   - Notification — UI shape returned by the API
 *
 * Depends on:
 *   - swr — initial fetch + cache; refreshInterval is 0 (SSE-only steady state)
 *   - ./use-shared-sse — single shared EventSource per user
 *   - @/hooks/use-toast — error toast for mark-read failures
 *
 * Side-effects:
 *   - HTTP GET /api/notifications on mount, on tab focus, on network reconnect, on SSE `notification_created`
 *   - HTTP PATCH /api/notifications on mark-read / mark-unread
 *
 * Key invariants:
 *   - On `notification_created` SSE event: revalidate (the event has a summary; full record fetched once via mutate)
 *   - No periodic polling — drift bounded by SSE delivery + revalidateOnFocus/Reconnect
 *   - `target=SPECIFIC` notifications are emitted per-userId; ALL/USERS/ADMINS via broadcast channel
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Production console-spam cleanup. Every console.log/warn was unconditional
 *     and fired on every fetch / response / mutate / "Final state" effect. Now
 *     gated to dev. Auth errors and "all retries failed" stay in prod since
 *     they are rare and operationally useful.
 */

"use client"

import { useCallback, useEffect } from "react"
import useSWR from "swr"
import { toast } from "@/hooks/use-toast"
import { useSharedSSESubscribe } from "@/lib/hooks/use-shared-sse"

export interface Notification {
  id: string
  title: string
  message: string
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  target: string
  createdAt: string
  expiresAt: string | null
  read: boolean
  createdBy: {
    id: string
    name: string | null
    email: string | null
  } | null
}

interface UseNotificationsReturn {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  error: Error | undefined
  refresh: () => Promise<void>
  markAsRead: (notificationIds: string[]) => Promise<void>
  markAsUnread: (notificationIds: string[]) => Promise<void>
}

const IS_DEV = process.env.NODE_ENV === 'development'

const fetcher = async (url: string) => {
  if (IS_DEV) {
    console.debug("🔔 [USE-NOTIFICATIONS] Fetching notifications from:", url)
  }

  let lastError: Error | null = null

  // Retry mechanism - try up to 3 times
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })

      if (!response.ok) {
        // For 401/403, don't retry - it's an auth issue
        if (response.status === 401 || response.status === 403) {
          const errorText = await response.text().catch(() => 'Unknown error')
          // Auth errors are rare and important; keep in prod.
          console.error("🔔 [USE-NOTIFICATIONS] Auth error (no retry):", errorText)
          throw new Error(`Authentication failed: ${response.status} ${response.statusText}`)
        }

        // For other errors, retry
        const errorText = await response.text().catch(() => 'Unknown error')
        lastError = new Error(`Failed to fetch notifications: ${response.status} ${response.statusText}`)
        if (IS_DEV) {
          console.warn(`🔔 [USE-NOTIFICATIONS] Attempt ${attempt} failed:`, errorText)
        }

        if (attempt < 3) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000))
          continue
        }

        throw lastError
      }

      const data = await response.json()

      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format')
      }

      // Ensure notifications is an array
      const notifications = Array.isArray(data.notifications) ? data.notifications : []
      const unreadCount = typeof data.unreadCount === 'number' ? data.unreadCount : 0

      // Return normalized data
      return {
        notifications,
        unreadCount,
        pagination: data.pagination || {
          total: notifications.length,
          limit: 50,
          offset: 0,
          hasMore: false
        },
        error: data.error || null
      }
    } catch (error: any) {
      lastError = error

      // Don't retry on abort (timeout) or auth errors
      if (error.name === 'AbortError' || error.message?.includes('Authentication failed')) {
        // Already logged above for auth; log timeouts in dev only.
        if (IS_DEV && error.name === 'AbortError') {
          console.warn("🔔 [USE-NOTIFICATIONS] Request timed out")
        }
        throw error
      }

      if (IS_DEV) {
        console.warn(`🔔 [USE-NOTIFICATIONS] Attempt ${attempt} error:`, error.message)
      }

      // If last attempt, throw the error
      if (attempt === 3) {
        // Final failure is rare and important; keep in prod.
        console.error("🔔 [USE-NOTIFICATIONS] All retry attempts failed:", error.message)
        throw lastError
      }

      // Exponential backoff before retry
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000))
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Failed to fetch notifications after retries')
}

export function useNotifications(userId: string | undefined | null): UseNotificationsReturn {
  // Validate userId. Used to console.warn on every render where userId was
  // empty (which floods the prod console while auth is loading or for any
  // anonymous render path). The SWR `null` key below already disables fetching
  // — no warning needed.

  // Follow the same pattern as orders/positions — pass userId for proper SWR caching key.
  const { data, error, isLoading, mutate } = useSWR(
    userId && userId.trim() !== '' ? `/api/notifications?userId=${userId}` : null,
    fetcher,
    {
      refreshInterval: 0, // SSE-driven; no periodic polling
      revalidateOnFocus: true,
      focusThrottleInterval: 30_000,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      onError: (error) => {
        if (IS_DEV) {
          console.error("🔔 [USE-NOTIFICATIONS] SWR error:", error.message)
        }
      },
    }
  )

  // Subscribe to SSE notification events — one revalidate per arrival.
  useSharedSSESubscribe(userId || undefined, useCallback((message) => {
    if (message.event === 'notification_created' || message.event === 'notification_deleted') {
      mutate().catch(err => {
        if (IS_DEV) {
          console.error('❌ [USE-NOTIFICATIONS] Refresh after SSE event failed:', err)
        }
      })
    }
  }, [mutate]))

  const refresh = useCallback(async () => {
    await mutate()
  }, [mutate])

  const markAsRead = useCallback(async (notificationIds: string[]) => {
    if (IS_DEV) {
      console.debug("🔔 [USE-NOTIFICATIONS] Marking notifications as read:", notificationIds)
    }
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notificationIds,
          read: true,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to mark notifications as read')
      }

      // Optimistically update the cache
      await mutate((current: any) => {
        if (!current) return current

        return {
          ...current,
          notifications: current.notifications.map((n: Notification) =>
            notificationIds.includes(n.id) ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, current.unreadCount - notificationIds.length),
        }
      }, false) // Don't revalidate immediately

      // Revalidate in background
      await mutate()
    } catch (error: any) {
      if (IS_DEV) {
        console.error('Failed to mark as read:', error)
      }
      toast({
        title: "Error",
        description: "Failed to mark notifications as read",
        variant: "destructive",
      })
    }
  }, [mutate])

  const markAsUnread = useCallback(async (notificationIds: string[]) => {
    if (IS_DEV) {
      console.debug("🔔 [USE-NOTIFICATIONS] Marking notifications as unread:", notificationIds)
    }
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notificationIds,
          read: false,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to mark notifications as unread')
      }

      // Optimistically update the cache
      await mutate((current: any) => {
        if (!current) return current

        return {
          ...current,
          notifications: current.notifications.map((n: Notification) =>
            notificationIds.includes(n.id) ? { ...n, read: false } : n
          ),
          unreadCount: current.unreadCount + notificationIds.length,
        }
      }, false) // Don't revalidate immediately

      // Revalidate in background
      await mutate()
    } catch (error: any) {
      if (IS_DEV) {
        console.error('Failed to mark as unread:', error)
      }
      toast({
        title: "Error",
        description: "Failed to mark notifications as unread",
        variant: "destructive",
      })
    }
  }, [mutate])

  // Polling-pause effect removed — no periodic polling exists. SSE keeps state fresh.

  // Normalize return values - ensure arrays and numbers are always valid
  const notifications = Array.isArray(data?.notifications) ? data.notifications : []
  const unreadCount = typeof data?.unreadCount === 'number' ? data.unreadCount : 0

  // Final-state debug log (dev only). Was unconditional + logged user id on
  // every notifications-array reference change — flooded prod consoles whenever
  // SSE-driven revalidations landed.
  useEffect(() => {
    if (IS_DEV && !isLoading && data) {
      console.debug("🔔 [USE-NOTIFICATIONS] Final state:", {
        notificationsCount: notifications.length,
        unreadCount,
        hasError: !!error,
      })
    }
  }, [isLoading, data, notifications.length, unreadCount, error])

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh,
    markAsRead,
    markAsUnread,
  }
}
