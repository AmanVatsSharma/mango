/**
 * File: lib/hooks/use-admin-notifications.ts
 * Module: notifications
 * Purpose: React hook for managing admin notifications with real-time updates
 * Author: BharatERP
 * Last-updated: 2025-01-27
 * Notes:
 * - Uses SWR for caching and real-time updates
 * - Auto-refreshes every 30 seconds
 * - Provides mark as read/unread functionality
 */

"use client"

import { useState, useCallback, useEffect } from "react"
import useSWR from "swr"
import { toast } from "@/hooks/use-toast"

export interface AdminNotification {
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

interface UseAdminNotificationsReturn {
  notifications: AdminNotification[]
  unreadCount: number
  isLoading: boolean
  error: Error | undefined
  refresh: () => Promise<void>
  markAsRead: (notificationIds: string[]) => Promise<void>
  markAsUnread: (notificationIds: string[]) => Promise<void>
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch notifications')
  }
  return response.json()
}

export function useAdminNotifications(): UseAdminNotificationsReturn {
  const [isPolling, setIsPolling] = useState(true)

  const { data, error, isLoading, mutate } = useSWR(
    '/api/admin/notifications',
    fetcher,
    {
      refreshInterval: isPolling ? 30000 : 0, // Poll every 30 seconds
      revalidateOnFocus: true,
      focusThrottleInterval: 60_000,
      revalidateOnReconnect: true,
      dedupingInterval: 5000, // Dedupe requests within 5 seconds
    }
  )

  const refresh = useCallback(async () => {
    await mutate()
  }, [mutate])

  const markAsRead = useCallback(async (notificationIds: string[]) => {
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
          notifications: current.notifications.map((n: AdminNotification) =>
            notificationIds.includes(n.id) ? { ...n, read: true } : n
          ),
        }
      }, false) // Don't revalidate immediately

      // Revalidate in background
      await mutate()
    } catch (error: any) {
      console.error('Failed to mark as read:', error)
      toast({
        title: "Error",
        description: "Failed to mark notifications as read",
        variant: "destructive",
      })
    }
  }, [mutate])

  const markAsUnread = useCallback(async (notificationIds: string[]) => {
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
          notifications: current.notifications.map((n: AdminNotification) =>
            notificationIds.includes(n.id) ? { ...n, read: false } : n
          ),
        }
      }, false) // Don't revalidate immediately

      // Revalidate in background
      await mutate()
    } catch (error: any) {
      console.error('Failed to mark as unread:', error)
      toast({
        title: "Error",
        description: "Failed to mark notifications as unread",
        variant: "destructive",
      })
    }
  }, [mutate])

  // Pause polling when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPolling(!document.hidden)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Calculate unread count
  const unreadCount = data?.notifications?.filter((n: AdminNotification) => !n.read).length || 0

  return {
    notifications: data?.notifications || [],
    unreadCount,
    isLoading,
    error,
    refresh,
    markAsRead,
    markAsUnread,
  }
}
