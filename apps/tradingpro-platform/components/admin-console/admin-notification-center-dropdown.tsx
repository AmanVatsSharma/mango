/**
 * File: components/admin-console/admin-notification-center-dropdown.tsx
 * Module: admin-console
 * Purpose: Admin notification center dropdown panel
 * Author: BharatERP
 * Last-updated: 2025-01-27
 * Notes:
 * - Compact version for header dropdown
 * - Quick actions and filters
 */

"use client"

import React, { useCallback } from "react"
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
  Clock,
  ExternalLink
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useAdminNotifications } from "@/lib/hooks/use-admin-notifications"
import { useRouter } from "next/navigation"
import { getAdminConsoleRoute } from "@/lib/branding-routes"

interface AdminNotificationCenterProps {
  onClose?: () => void
}

type NotificationType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'

// Simple time formatter
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

export function AdminNotificationCenter({ onClose }: AdminNotificationCenterProps) {
  const router = useRouter()
  const { 
    notifications, 
    unreadCount, 
    isLoading, 
    refresh,
    markAsRead,
    markAsUnread 
  } = useAdminNotifications()

  // Show all notifications - no filtering, limit to latest 10 for dropdown
  const displayNotifications = notifications.slice(0, 10)

  const handleMarkAsRead = useCallback(async (notificationId: string) => {
    await markAsRead([notificationId])
  }, [markAsRead])

  const handleMarkAllAsRead = useCallback(async () => {
    const unreadIds = displayNotifications
      .filter(n => !n.read)
      .map(n => n.id)
    
    if (unreadIds.length > 0) {
      await markAsRead(unreadIds)
    }
  }, [displayNotifications, markAsRead])

  const handleViewAll = useCallback(() => {
    router.push(getAdminConsoleRoute("notifications"))
    onClose?.()
  }, [router, onClose])

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

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="w-[90vw] sm:w-[420px] max-h-[600px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
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
            {isLoading && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Loading notifications...</p>
              </div>
            ) : displayNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground font-medium">No notifications</p>
                <p className="text-xs text-muted-foreground/70 mt-1">You're all caught up!</p>
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
                              onClick={() => handleMarkAsRead(notification.id)}
                              title="Mark as read"
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

        {/* Footer */}
        {notifications.length > 10 && (
          <div className="border-t border-border p-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleViewAll}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View All Notifications ({notifications.length})
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  )
}
