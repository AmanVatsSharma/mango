/**
 * File: components/notifications/NotificationCenter.tsx
 * Module: notifications
 * Purpose: Notification center panel with unified notification list (no filters)
 * Author: BharatERP
 * Last-updated: 2025-01-27
 * Notes:
 * - Modern, responsive design
 * - Shows all notifications in a single list (no filters)
 * - Mark as read/unread functionality
 * - Smooth animations
 */

"use client"

import React, { useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Info,
  Check,
  X,
  Loader2,
  RefreshCw,
  Clock
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useNotifications } from "@/lib/hooks/use-notifications"

// Simple time formatter - no external dependency needed
const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

interface NotificationCenterProps {
  userId?: string | null
  onClose?: () => void
}

type NotificationType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'

export function NotificationCenter({ userId, onClose }: NotificationCenterProps) {
  // Per-render console.log of userId removed — it fired on every render of the
  // popover and was redundant with React DevTools.
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh,
    markAsRead,
    markAsUnread,
  } = useNotifications(userId)

  // Notifications-changed debug log: gate to dev only and trim the payload.
  // Previously this logged the full mapped notifications array on every SSE-
  // driven update — with the popover open and a busy account, that means a
  // mapped-array log per realtime event.
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.debug("🔔 [NOTIFICATION-CENTER] Notifications updated:", {
        userId,
        count: notifications.length,
        unreadCount,
        isLoading,
        hasError: !!error,
      })
      if (error) {
        console.error("🔔 [NOTIFICATION-CENTER] Error fetching notifications:", {
          message: error.message,
          userId,
        })
      }
    }
  }, [userId, notifications.length, unreadCount, isLoading, error])

  // Show all notifications - no filtering
  const displayNotifications = notifications

  const handleMarkAsRead = useCallback(async (notificationId: string) => {
    await markAsRead([notificationId])
  }, [markAsRead])

  const handleMarkAsUnread = useCallback(async (notificationId: string) => {
    await markAsUnread([notificationId])
  }, [markAsUnread])

  const handleMarkAllAsRead = useCallback(async () => {
    const unreadIds = displayNotifications
      .filter(n => !n.read)
      .map(n => n.id)
    
    if (unreadIds.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.debug("🔔 [NOTIFICATION-CENTER] Marking all as read:", unreadIds)
      }
      await markAsRead(unreadIds)
    }
  }, [displayNotifications, markAsRead])

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case 'SUCCESS':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'ERROR':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'WARNING':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      default:
        return <Info className="h-4 w-4 text-blue-500" />
    }
  }

  const getTypeBadgeColor = (type: NotificationType) => {
    switch (type) {
      case 'SUCCESS':
        return 'bg-green-500/10 text-green-600 border-green-500/20'
      case 'ERROR':
        return 'bg-red-500/10 text-red-600 border-red-500/20'
      case 'WARNING':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
      default:
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
    }
  }

  const getPriorityBadgeColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-red-500 text-white'
      case 'HIGH':
        return 'bg-orange-500 text-white'
      case 'MEDIUM':
        return 'bg-blue-500 text-white'
      default:
        return 'bg-gray-500 text-white'
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="w-full sm:w-[420px] max-h-[600px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
    >
      <Card className="border-0 shadow-none">
        {/* Header */}
        <CardHeader className="pb-3 border-b border-border bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-semibold">Notifications</CardTitle>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {unreadCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={refresh}
                disabled={isLoading}
              >
                <RefreshCw className={cn(
                  "h-4 w-4",
                  isLoading && "animate-spin"
                )} />
              </Button>
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Mark all as read */}
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs mt-2 w-full justify-start text-muted-foreground"
              onClick={handleMarkAllAsRead}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all as read
            </Button>
          )}
        </CardHeader>

        {/* Notifications List */}
        <CardContent className="p-0">
          <div className="max-h-[450px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {error && !isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <AlertCircle className="h-12 w-12 text-destructive/50 mb-2" />
                <p className="text-sm font-medium text-destructive mb-1">Failed to load notifications</p>
                <p className="text-xs text-muted-foreground text-center mb-3 max-w-xs">
                  {error.message || "An error occurred while fetching notifications"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      console.log("🔔 [NOTIFICATION-CENTER] Manual retry triggered")
                      refresh()
                    }}
                    className="mt-2"
                  >
                    <RefreshCw className="h-3 w-3 mr-2" />
                    Retry
                  </Button>
                  {notifications.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        console.log("🔔 [NOTIFICATION-CENTER] Showing cached notifications")
                      }}
                      className="mt-2"
                    >
                      Show Cached ({notifications.length})
                    </Button>
                  )}
                </div>
              </div>
            ) : isLoading && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Loading notifications...</p>
              </div>
            ) : displayNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground font-medium">No notifications</p>
                <p className="text-xs text-muted-foreground/70 mt-1 text-center px-4">
                  {error ? (
                    <>
                      Could not load notifications. 
                      <button 
                        onClick={() => refresh()} 
                        className="underline ml-1 hover:text-primary"
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    "You're all caught up!"
                  )}
                </p>
              </div>
            ) : (
              <AnimatePresence>
                {displayNotifications.map((notification, index) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      "hover:bg-muted/50 transition-colors",
                      !notification.read && "bg-primary/5"
                    )}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={cn(
                          "mt-0.5 p-1.5 rounded-lg",
                          getTypeBadgeColor(notification.type)
                        )}>
                          {getTypeIcon(notification.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className={cn(
                              "text-sm font-semibold text-foreground",
                              !notification.read && "font-bold"
                            )}>
                              {notification.title}
                            </h4>
                            {!notification.read && (
                              <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-2 leading-relaxed">
                            {notification.message}
                          </p>

                          <div className="flex items-center gap-2 flex-wrap">
                            {notification.priority !== 'MEDIUM' && (
                              <Badge 
                                className={cn("text-xs h-5", getPriorityBadgeColor(notification.priority))}
                              >
                                {notification.priority}
                              </Badge>
                            )}

                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatTimeAgo(notification.createdAt)}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1">
                          {notification.read ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleMarkAsUnread(notification.id)}
                              title="Mark as unread"
                            >
                              <Bell className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleMarkAsRead(notification.id)}
                              title="Mark as read"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
