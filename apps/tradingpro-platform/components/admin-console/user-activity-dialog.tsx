/**
 * @file user-activity-dialog.tsx
 * @module admin-console
 * @description Dialog showing comprehensive user activity log
 * @author StockTrade
 * @created 2025-01-27
 */

"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, RefreshCw, Calendar, DollarSign, Shield, LogIn, FileText } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface UserActivityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: any
}

export function UserActivityDialog({ open, onOpenChange, user }: UserActivityDialogProps) {
  const [loading, setLoading] = useState(false)
  const [activities, setActivities] = useState<any[]>([])

  useEffect(() => {
    if (open && user?.id) {
      fetchActivities()
    }
  }, [open, user?.id])

  const fetchActivities = async () => {
    setLoading(true)
    console.log("📊 [USER-ACTIVITY] Fetching activities for user:", user.id)

    try {
      const response = await fetch(`/api/admin/users/${user.id}/activity?limit=100`)
      if (!response.ok) throw new Error("Failed to fetch activities")

      const data = await response.json()
      if (data.success) {
        setActivities(data.activities || [])
        console.log(`✅ [USER-ACTIVITY] Loaded ${data.activities?.length || 0} activities`)
      }
    } catch (error) {
      console.error("❌ [USER-ACTIVITY] Error fetching activities:", error)
      setActivities([])
    } finally {
      setLoading(false)
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'AUTH':
        return <LogIn className="w-4 h-4 text-blue-400" />
      case 'ORDER':
        return <Activity className="w-4 h-4 text-purple-400" />
      case 'TRADE':
        return <DollarSign className="w-4 h-4 text-green-400" />
      case 'DEPOSIT':
        return <DollarSign className="w-4 h-4 text-emerald-400" />
      case 'WITHDRAWAL':
        return <DollarSign className="w-4 h-4 text-red-400" />
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getActivityBadge = (type: string) => {
    const colors: Record<string, string> = {
      'AUTH': 'bg-blue-400/20 text-blue-400 border-blue-400/30',
      'ORDER': 'bg-purple-400/20 text-purple-400 border-purple-400/30',
      'TRADE': 'bg-green-400/20 text-green-400 border-green-400/30',
      'DEPOSIT': 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30',
      'WITHDRAWAL': 'bg-red-400/20 text-red-400 border-red-400/30'
    }
    return <Badge className={colors[type] || 'bg-gray-400/20 text-gray-400 border-gray-400/30'}>{type}</Badge>
  }

  const formatTimestamp = (timestamp: string | Date) => {
    return new Date(timestamp).toLocaleString()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-4xl bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="text-lg sm:text-xl font-bold text-primary flex items-center gap-2">
            <Activity className="w-5 h-5" />
            User Activity Log
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Complete activity history for {user?.name || user?.clientId}
          </DialogDescription>
        </DialogHeader>

        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Header Actions */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {activities.length} recent activities
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchActivities}
              disabled={loading}
              className="border-primary/50 text-primary hover:bg-primary/10"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Activity Table */}
          <Card className="bg-muted/30 border-border">
            <CardContent className="p-0">
              {loading && activities.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
                  Loading activities...
                </div>
              ) : activities.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No activities found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-muted-foreground">Time</TableHead>
                        <TableHead className="text-muted-foreground">Type</TableHead>
                        <TableHead className="text-muted-foreground">Action</TableHead>
                        <TableHead className="text-muted-foreground">Description</TableHead>
                        <TableHead className="text-muted-foreground">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activities.map((activity, index) => (
                        <motion.tr
                          key={activity.id}
                          className="border-border hover:bg-muted/30 transition-colors"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: index * 0.01 }}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm text-foreground">
                                {formatTimestamp(activity.timestamp)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getActivityIcon(activity.type)}
                              {getActivityBadge(activity.type)}
                            </div>
                          </TableCell>
                          <TableCell className="text-foreground font-medium">
                            {activity.action}
                          </TableCell>
                          <TableCell className="text-foreground">
                            {activity.description}
                          </TableCell>
                          <TableCell>
                            {activity.amount ? (
                              <span className={`font-bold ${activity.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {activity.amount > 0 ? '+' : ''}₹{Math.abs(activity.amount).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </motion.tr>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
