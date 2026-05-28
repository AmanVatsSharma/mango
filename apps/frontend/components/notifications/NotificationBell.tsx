/**
 * File: components/notifications/NotificationBell.tsx
 * Module: notifications
 * Purpose: Notification bell component with badge and dropdown panel
 * Author: BharatERP
 * Last-updated: 2025-01-27
 * Notes:
 * - Shows unread count badge
 * - Opens notification center on click
 * - Real-time updates via polling
 */

"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { NotificationCenter } from "./NotificationCenter"
import { useNotifications } from "@/lib/hooks/use-notifications"

interface NotificationBellProps {
  userId?: string | null
  className?: string
}

export function NotificationBell({ userId, className }: NotificationBellProps) {
  // The previous unconditional console.log fired on EVERY render of this
  // component (which is mounted in the dashboard header — so every parent
  // re-render flooded prod consoles with full userId / timestamp payloads).
  // The information is already available in React DevTools when needed.
  const [isOpen, setIsOpen] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  
  // Use hook with userId (will be undefined/null if not provided)
  const { unreadCount, isLoading, error, notifications, refresh } = useNotifications(userId)

  useEffect(() => {
    if (error) {
      // Keep error logs in dev; on prod, the error is already surfaced via
      // useNotifications and the retry logic below handles recovery.
      if (process.env.NODE_ENV === "development") {
        console.error("🔔 [NOTIFICATION-BELL] Error fetching notifications:", {
          message: error.message,
          userId,
          retryCount,
        })
      }

      // Auto-retry on error (up to 3 times)
      if (retryCount < 3 && !isLoading) {
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000)
        const timeoutId = setTimeout(() => {
          setRetryCount(prev => prev + 1)
          refresh().catch(err => {
            if (process.env.NODE_ENV === "development") {
              console.error("🔔 [NOTIFICATION-BELL] Retry failed:", err)
            }
          })
        }, retryDelay)
        return () => clearTimeout(timeoutId)
      }
    } else if (retryCount > 0) {
      setRetryCount(0)
    }
  }, [error, isLoading, retryCount, refresh, userId])

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        className={cn(
          "relative h-9 w-9 transition-all duration-200",
          "hover:bg-muted/50",
          isOpen && "bg-muted"
        )}
        aria-label="Notifications"
      >
        <Bell className={cn(
          "h-5 w-5 transition-all duration-200",
          isOpen && "text-primary"
        )} />
        
        {/* Unread Badge */}
        {!isLoading && unreadCount > 0 && (
          <span className={cn(
            "absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full",
            "bg-red-500 text-white text-[10px] font-bold",
            "flex items-center justify-center px-1",
            "animate-pulse shadow-lg shadow-red-500/50",
            "border-2 border-background"
          )}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        
        {/* Error indicator - show only if persistent error after retries */}
        {error && !isLoading && retryCount >= 3 && (
          <span 
            className={cn(
              "absolute -top-1 -right-1 min-w-[8px] h-[8px] rounded-full",
              "bg-yellow-500 border-2 border-background animate-pulse"
            )} 
            title={`Error: ${error.message}. Click to retry.`}
            onClick={(e) => {
              e.stopPropagation()
              setRetryCount(0)
              refresh()
            }}
          />
        )}
        
        {/* Retrying indicator */}
        {error && isLoading && retryCount > 0 && retryCount < 3 && (
          <span className={cn(
            "absolute -top-1 -right-1 min-w-[8px] h-[8px] rounded-full",
            "bg-blue-500 border-2 border-background animate-pulse"
          )} title="Retrying..." />
        )}
      </Button>

      {/* Notification Center Dropdown */}
      {isOpen && (
        <div className="fixed inset-x-2 top-[3.5rem] z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2">
          <NotificationCenter
            userId={userId}
            onClose={handleClose}
          />
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={handleClose}
        />
      )}
    </div>
  )
}
