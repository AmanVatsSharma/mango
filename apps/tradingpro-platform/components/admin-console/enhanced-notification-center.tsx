/**
 * File: components/admin-console/enhanced-notification-center.tsx
 * Module: admin-console
 * Purpose: Enhanced notification center for admin console with advanced features
 * Author: BharatERP
 * Last-updated: 2025-01-27
 * Notes:
 * - User selection for SPECIFIC notifications
 * - Statistics and analytics
 * - Bulk actions
 * - Notification templates
 * - Better UI matching user notification center
 */

"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Bell,
  Plus,
  Send,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  Trash2,
  Check,
  Users,
  BarChart3,
  FileText,
  Search,
  Filter,
  Clock,
  Eye,
  X,
  Loader2
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { useAdminNotifications } from "@/lib/hooks/use-admin-notifications"
import { cn } from "@/lib/utils"
import { PageHeader, RefreshButton, StatusBadge, TradingDashboardOnlineDot } from "@/components/admin-console/shared"
import { useAdminTradingPresenceStream } from "@/lib/hooks/use-admin-trading-presence-sse"

interface User {
  id: string
  name: string | null
  email: string | null
  clientId: string | null
  isTradingDashboardOnline?: boolean
}

const NOTIFICATION_TEMPLATES = [
  {
    id: 'maintenance',
    title: 'Scheduled Maintenance',
    message: 'We will be performing scheduled maintenance on [DATE] from [TIME]. Services may be temporarily unavailable.',
    type: 'WARNING' as const,
    priority: 'HIGH' as const
  },
  {
    id: 'new-feature',
    title: 'New Feature Available',
    message: 'We\'re excited to announce a new feature: [FEATURE_NAME]. Check it out now!',
    type: 'SUCCESS' as const,
    priority: 'MEDIUM' as const
  },
  {
    id: 'security-alert',
    title: 'Security Alert',
    message: 'Important security update: [DETAILS]. Please update your password if you haven\'t done so recently.',
    type: 'ERROR' as const,
    priority: 'URGENT' as const
  },
  {
    id: 'market-update',
    title: 'Market Update',
    message: 'Important market update: [DETAILS]. Please review your positions.',
    type: 'INFO' as const,
    priority: 'HIGH' as const
  }
]

export function EnhancedNotificationCenter() {
  const { notifications, unreadCount, isLoading, refresh, markAsRead, markAsUnread } = useAdminNotifications()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showUserSelector, setShowUserSelector] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'ALL' | 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'>('ALL')
  const [showStats, setShowStats] = useState(true)

  const [newNotification, setNewNotification] = useState({
    title: '',
    message: '',
    type: 'INFO' as string,
    priority: 'MEDIUM' as string,
    target: 'ALL' as string,
    targetUserIds: [] as string[],
    expiresAt: '',
    template: '' as string
  })

  // Fetch users for SPECIFIC target
  const fetchUsers = useCallback(async (search: string = '') => {
    setLoadingUsers(true)
    try {
      const response = await fetch(`/api/admin/users/list?search=${encodeURIComponent(search)}&limit=50`)
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    if (newNotification.target === 'SPECIFIC' && showUserSelector) {
      fetchUsers(userSearch)
    }
  }, [newNotification.target, showUserSelector, userSearch, fetchUsers])

  const pickerUserIds = useMemo(() => users.map((u) => u.id), [users])
  const pickerLivePresence = useAdminTradingPresenceStream(
    pickerUserIds,
    newNotification.target === "SPECIFIC" && showUserSelector && users.length > 0,
  )

  // Calculate statistics
  const stats = {
    total: notifications.length,
    unread: unreadCount,
    byType: {
      INFO: notifications.filter(n => n.type === 'INFO').length,
      SUCCESS: notifications.filter(n => n.type === 'SUCCESS').length,
      WARNING: notifications.filter(n => n.type === 'WARNING').length,
      ERROR: notifications.filter(n => n.type === 'ERROR').length
    },
    byPriority: {
      LOW: notifications.filter(n => n.priority === 'LOW').length,
      MEDIUM: notifications.filter(n => n.priority === 'MEDIUM').length,
      HIGH: notifications.filter(n => n.priority === 'HIGH').length,
      URGENT: notifications.filter(n => n.priority === 'URGENT').length
    }
  }

  const handleCreateNotification = async () => {
    if (!newNotification.title || !newNotification.message) {
      toast({
        title: "Error",
        description: "Title and message are required",
        variant: "destructive"
      })
      return
    }

    if (newNotification.target === 'SPECIFIC' && selectedUsers.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one user for SPECIFIC target",
        variant: "destructive"
      })
      return
    }

    try {
      console.log("📤 [NOTIFICATION-CENTER] Creating notification:", {
        ...newNotification,
        targetUserIds: newNotification.target === 'SPECIFIC' ? selectedUsers : [],
        expiresAt: newNotification.expiresAt ? new Date(newNotification.expiresAt).toISOString() : null
      })

      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newNotification,
          targetUserIds: newNotification.target === 'SPECIFIC' ? selectedUsers : [],
          expiresAt: newNotification.expiresAt ? new Date(newNotification.expiresAt).toISOString() : null
        })
      })

      const data = await response.json()
      console.log("📥 [NOTIFICATION-CENTER] Response:", data)

      if (response.ok && data.success) {
        toast({
          title: "Success",
          description: "Notification created successfully"
        })
        setShowCreateDialog(false)
        setNewNotification({
          title: '',
          message: '',
          type: 'INFO',
          priority: 'MEDIUM',
          target: 'ALL',
          targetUserIds: [],
          expiresAt: '',
          template: ''
        })
        setSelectedUsers([])
        refresh()
      } else {
        const errorMessage = data.error || 'Failed to create notification'
        console.error("❌ [NOTIFICATION-CENTER] Error:", errorMessage)
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        })
      }
    } catch (error: any) {
      console.error("❌ [NOTIFICATION-CENTER] Exception:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to create notification",
        variant: "destructive"
      })
    }
  }

  const handleTemplateSelect = (templateId: string) => {
    const template = NOTIFICATION_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      setNewNotification({
        ...newNotification,
        title: template.title,
        message: template.message,
        type: template.type,
        priority: template.priority,
        template: templateId
      })
    }
  }

  const handleBulkMarkAsRead = async () => {
    if (selectedNotifications.size === 0) return
    await markAsRead(Array.from(selectedNotifications))
    setSelectedNotifications(new Set())
  }

  const filteredNotifications = notifications.filter(n => 
    filter === 'ALL' || n.type === filter
  )

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'SUCCESS': return <CheckCircle2 className="w-5 h-5 text-green-400" />
      case 'WARNING': return <AlertTriangle className="w-5 h-5 text-yellow-400" />
      case 'ERROR': return <XCircle className="w-5 h-5 text-red-400" />
      default: return <Info className="w-5 h-5 text-blue-400" />
    }
  }


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

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <PageHeader
        title="Notification Center"
        description="Manage system-wide announcements and alerts"
        icon={<Bell className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" />}
        actions={
          <>
            <RefreshButton onClick={refresh} loading={isLoading} />
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Notification
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Notification</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Templates */}
                <div>
                  <Label>Templates (Optional)</Label>
                  <Select value={newNotification.template} onValueChange={handleTemplateSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTIFICATION_TEMPLATES.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Title *</Label>
                  <Input
                    value={newNotification.title}
                    onChange={(e) => setNewNotification({ ...newNotification, title: e.target.value })}
                    placeholder="Notification title"
                  />
                </div>

                <div>
                  <Label>Message *</Label>
                  <Textarea
                    value={newNotification.message}
                    onChange={(e) => setNewNotification({ ...newNotification, message: e.target.value })}
                    placeholder="Notification message"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Type</Label>
                    <Select value={newNotification.type} onValueChange={(value) => setNewNotification({ ...newNotification, type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INFO">Info</SelectItem>
                        <SelectItem value="WARNING">Warning</SelectItem>
                        <SelectItem value="ERROR">Error</SelectItem>
                        <SelectItem value="SUCCESS">Success</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={newNotification.priority} onValueChange={(value) => setNewNotification({ ...newNotification, priority: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="URGENT">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Target Audience</Label>
                  <Select value={newNotification.target} onValueChange={(value) => {
                    setNewNotification({ ...newNotification, target: value })
                    if (value === 'SPECIFIC') {
                      setShowUserSelector(true)
                    } else {
                      setShowUserSelector(false)
                      setSelectedUsers([])
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Users</SelectItem>
                      <SelectItem value="ADMINS">Admins Only</SelectItem>
                      <SelectItem value="USERS">Users Only</SelectItem>
                      <SelectItem value="SPECIFIC">Specific Users</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* User Selector for SPECIFIC */}
                {newNotification.target === 'SPECIFIC' && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Select Users</Label>
                      <Badge>{selectedUsers.length} selected</Badge>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {loadingUsers ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : users.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
                      ) : (
                        users.map(user => (
                          <div key={user.id} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                            <Checkbox
                              checked={selectedUsers.includes(user.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedUsers([...selectedUsers, user.id])
                                } else {
                                  setSelectedUsers(selectedUsers.filter(id => id !== user.id))
                                }
                              }}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                                {(() => {
                                  const live = pickerLivePresence[user.id]
                                  const on =
                                    live !== undefined ? live : Boolean(user.isTradingDashboardOnline)
                                  return on ? <TradingDashboardOnlineDot /> : null
                                })()}
                                {user.name || user.email}
                              </p>
                              <p className="text-xs text-muted-foreground">{user.clientId || user.email}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <Label>Expires At (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={newNotification.expiresAt}
                    onChange={(e) => setNewNotification({ ...newNotification, expiresAt: e.target.value })}
                  />
                </div>

                <Button onClick={handleCreateNotification} className="w-full">
                  <Send className="w-4 h-4 mr-2" />
                  Send Notification
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </>
        }
      />

      {/* Statistics Cards */}
      {showStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Unread</p>
                  <p className="text-2xl font-bold text-primary">{stats.unread}</p>
                </div>
                <Bell className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">High Priority</p>
                  <p className="text-2xl font-bold text-orange-500">{stats.byPriority.HIGH + stats.byPriority.URGENT}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Errors</p>
                  <p className="text-2xl font-bold text-red-500">{stats.byType.ERROR}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Bulk Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR'] as const).map((type) => (
            <Button
              key={type}
              variant={filter === type ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(type)}
            >
              {type}
            </Button>
          ))}
        </div>
        {selectedNotifications.size > 0 && (
          <div className="flex items-center gap-2">
            <Badge>{selectedNotifications.size} selected</Badge>
            <Button variant="outline" size="sm" onClick={handleBulkMarkAsRead}>
              <Check className="w-4 h-4 mr-1" />
              Mark Read
            </Button>
          </div>
        )}
      </div>

      {/* Notifications List */}
      <div className="space-y-4">
        {isLoading && notifications.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading notifications...</p>
            </CardContent>
          </Card>
        ) : filteredNotifications.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-muted-foreground">No notifications found</p>
            </CardContent>
          </Card>
        ) : (
          filteredNotifications.map((notification) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className={cn(
                !notification.read && "border-primary/50 bg-primary/5"
              )}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={selectedNotifications.has(notification.id)}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(selectedNotifications)
                        if (checked) {
                          newSet.add(notification.id)
                        } else {
                          newSet.delete(notification.id)
                        }
                        setSelectedNotifications(newSet)
                      }}
                    />
                    {getTypeIcon(notification.type)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className={cn(
                          "font-semibold",
                          !notification.read && "font-bold"
                        )}>
                          {notification.title}
                        </h3>
                        <StatusBadge status={notification.type} type="notification" />
                        {!notification.read && (
                          <Badge className="bg-primary/20 text-primary">New</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Target: {notification.target}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(notification.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markAsRead([notification.id])}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
