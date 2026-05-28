/**
 * @file notification-center.tsx
 * @module admin-console
 * @description Enterprise notification center for system-wide announcements and alerts
 * @author StockTrade
 * @created 2025-01-27
 */

"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Bell,
  Plus,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  Trash2,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface Notification {
  id: string
  title: string
  message: string
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  target: 'ALL' | 'ADMINS' | 'USERS' | 'SPECIFIC'
  createdAt: Date
  expiresAt?: Date
  read: boolean
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [newNotification, setNewNotification] = useState({
    title: '',
    message: '',
    type: 'INFO' as string,
    priority: 'MEDIUM' as string,
    target: 'ALL' as string,
  })

  const fetchNotifications = async () => {
    setLoading(true)
    console.log("🔔 [NOTIFICATION-CENTER] Fetching notifications...")

    try {
      // Get session info for read status
      const sessionResponse = await fetch('/api/admin/me').catch(() => null)
      const sessionData = sessionResponse && sessionResponse.ok ? await sessionResponse.json() : null
      if (sessionData) setSession(sessionData)

      const response = await fetch('/api/admin/notifications').catch(() => null)

      if (response && response.ok) {
        const data = await response.json()
        const userId = sessionData?.id || sessionData?.user?.id || ''
        const formattedNotifications = (data.notifications || []).map((n: any) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          priority: n.priority,
          target: n.target,
          createdAt: new Date(n.createdAt),
          expiresAt: n.expiresAt ? new Date(n.expiresAt) : undefined,
          read: n.read || false, // API already includes read status
        }))
        setNotifications(formattedNotifications)
        console.log(`✅ [NOTIFICATION-CENTER] Loaded ${formattedNotifications.length} notifications`)
      } else {
        console.warn("⚠️ [NOTIFICATION-CENTER] Failed to fetch notifications")
        setNotifications([])
      }
    } catch (error) {
      console.error("❌ [NOTIFICATION-CENTER] Error fetching notifications:", error)
      toast({
        title: "Error",
        description: "Failed to load notifications",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  const handleCreateNotification = async () => {
    try {
      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNotification),
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Notification created successfully",
        })
        setShowCreateDialog(false)
        setNewNotification({
          title: '',
          message: '',
          type: 'INFO',
          priority: 'MEDIUM',
          target: 'ALL',
        })
        fetchNotifications()
      } else {
        throw new Error('Failed to create notification')
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create notification",
        variant: "destructive",
      })
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'SUCCESS':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />
      case 'WARNING':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />
      case 'ERROR':
        return <XCircle className="w-5 h-5 text-red-400" />
      case 'INFO':
      default:
        return <Info className="w-5 h-5 text-blue-400" />
    }
  }

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      'INFO': 'bg-blue-400/20 text-blue-400 border-blue-400/30',
      'WARNING': 'bg-yellow-400/20 text-yellow-400 border-yellow-400/30',
      'ERROR': 'bg-red-400/20 text-red-400 border-red-400/30',
      'SUCCESS': 'bg-green-400/20 text-green-400 border-green-400/30',
    }
    return <Badge className={colors[type] || colors['INFO']}>{type}</Badge>
  }

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      'LOW': 'bg-gray-400/20 text-gray-400 border-gray-400/30',
      'MEDIUM': 'bg-blue-400/20 text-blue-400 border-blue-400/30',
      'HIGH': 'bg-orange-400/20 text-orange-400 border-orange-400/30',
      'URGENT': 'bg-red-400/20 text-red-400 border-red-400/30',
    }
    return <Badge className={colors[priority] || colors['MEDIUM']}>{priority}</Badge>
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0"
      >
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-primary mb-1 sm:mb-2 flex items-center gap-2 break-words">
            <Bell className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />
            <span>Notification Center</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground break-words">Manage system-wide announcements and alerts</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNotifications}
            disabled={loading}
            className="border-primary/50 text-primary hover:bg-primary/10 text-xs sm:text-sm"
          >
            <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm" size="sm">
                <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Create Notification</span>
                <span className="sm:hidden">Create</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] sm:w-full sm:max-w-md bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
              <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
                <DialogTitle className="text-lg sm:text-xl font-bold text-primary">Create Notification</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={newNotification.title}
                    onChange={(e) => setNewNotification({ ...newNotification, title: e.target.value })}
                    placeholder="Notification title"
                  />
                </div>
                <div>
                  <Label>Message</Label>
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
                  <Select value={newNotification.target} onValueChange={(value) => setNewNotification({ ...newNotification, target: value })}>
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
                <Button onClick={handleCreateNotification} className="w-full">
                  <Send className="w-4 h-4 mr-2" />
                  Send Notification
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Notifications List */}
      <div className="space-y-4">
        {loading && notifications.length === 0 ? (
          <Card className="bg-card border-border shadow-sm neon-border">
            <CardContent className="p-6 text-center text-muted-foreground">
              Loading notifications...
            </CardContent>
          </Card>
        ) : notifications.length === 0 ? (
          <Card className="bg-card border-border shadow-sm neon-border">
            <CardContent className="p-6 text-center text-muted-foreground">
              No notifications found
            </CardContent>
          </Card>
        ) : (
          notifications.map((notification) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className={`bg-card border-border shadow-sm neon-border ${!notification.read ? 'border-primary/50' : ''}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {getTypeIcon(notification.type)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-foreground">{notification.title}</h3>
                          {getTypeBadge(notification.type)}
                          {getPriorityBadge(notification.priority)}
                          {!notification.read && (
                            <Badge className="bg-primary/20 text-primary border-primary/30">New</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Target: {notification.target}</span>
                          <span>•</span>
                          <span>{new Date(notification.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
