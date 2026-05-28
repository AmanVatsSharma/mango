/**
 * @file kyc-management-dialog.tsx
 * @module admin-console
 * @description Dialog for managing user KYC status (approve/reject)
 * @author StockTrade
 * @created 2025-01-27
 */

"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { Shield, CheckCircle, XCircle, Clock, FileText, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface KYCManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: any
  onKYCUpdated?: () => void
}

export function KYCManagementDialog({ open, onOpenChange, user, onKYCUpdated }: KYCManagementDialogProps) {
  const [loading, setLoading] = useState(false)
  const [kycData, setKycData] = useState<any>(null)
  const [reason, setReason] = useState("")
  const [action, setAction] = useState<"APPROVED" | "REJECTED" | null>(null)

  useEffect(() => {
    if (open && user) {
      console.log("📋 [KYC-MANAGEMENT] Loading KYC data for user:", user.id)
      // Fetch full user details to get KYC info
      fetch(`/api/admin/users/${user.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.user.kyc) {
            setKycData(data.user.kyc)
            console.log("✅ [KYC-MANAGEMENT] KYC data loaded:", data.user.kyc)
          } else {
            setKycData(null)
          }
        })
        .catch(err => {
          console.error("❌ [KYC-MANAGEMENT] Error loading KYC:", err)
          setKycData(null)
        })
    }
  }, [open, user])

  const handleApprove = async () => {
    if (!kycData) {
      toast({
        title: "No KYC Found",
        description: "This user has not submitted KYC documents",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    setAction("APPROVED")
    console.log("✅ [KYC-MANAGEMENT] Approving KYC for user:", user.id)

    try {
      const response = await fetch(`/api/admin/users/${user.id}/kyc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          reason: reason || 'KYC approved by admin'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to approve KYC")
      }

      const result = await response.json()
      console.log("✅ [KYC-MANAGEMENT] KYC approved successfully:", result)

      toast({
        title: "✅ KYC Approved",
        description: "User KYC has been approved successfully",
      })

      if (onKYCUpdated) {
        onKYCUpdated()
      }

      onOpenChange(false)
      setReason("")
      setAction(null)
    } catch (error: any) {
      console.error("❌ [KYC-MANAGEMENT] Error approving KYC:", error)
      toast({
        title: "❌ Error",
        description: error.message || "Failed to approve KYC",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
      setAction(null)
    }
  }

  const handleReject = async () => {
    if (!kycData) {
      toast({
        title: "No KYC Found",
        description: "This user has not submitted KYC documents",
        variant: "destructive"
      })
      return
    }

    if (!reason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for rejection",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    setAction("REJECTED")
    console.log("❌ [KYC-MANAGEMENT] Rejecting KYC for user:", user.id)

    try {
      const response = await fetch(`/api/admin/users/${user.id}/kyc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'REJECTED',
          reason: reason
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to reject KYC")
      }

      const result = await response.json()
      console.log("✅ [KYC-MANAGEMENT] KYC rejected successfully:", result)

      toast({
        title: "KYC Rejected",
        description: "User KYC has been rejected",
      })

      if (onKYCUpdated) {
        onKYCUpdated()
      }

      onOpenChange(false)
      setReason("")
      setAction(null)
    } catch (error: any) {
      console.error("❌ [KYC-MANAGEMENT] Error rejecting KYC:", error)
      toast({
        title: "❌ Error",
        description: error.message || "Failed to reject KYC",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
      setAction(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <Badge className="bg-green-400/20 text-green-400 border-green-400/30">Approved</Badge>
      case "REJECTED":
        return <Badge className="bg-red-400/20 text-red-400 border-red-400/30">Rejected</Badge>
      case "PENDING":
        return <Badge className="bg-yellow-400/20 text-yellow-400 border-yellow-400/30">Pending</Badge>
      default:
        return <Badge className="bg-gray-400/20 text-gray-400 border-gray-400/30">Not Submitted</Badge>
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="text-lg sm:text-xl font-bold text-primary flex items-center gap-2">
            <Shield className="w-5 h-5" />
            KYC Management
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Review and manage KYC status for {user?.name || user?.clientId}
          </DialogDescription>
        </DialogHeader>

        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {!kycData ? (
            <Alert className="bg-yellow-500/10 border-yellow-500/50">
              <FileText className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-500/80">
                This user has not submitted KYC documents yet.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* KYC Information */}
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Current Status</h3>
                    {getStatusBadge(kycData.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Aadhaar Number</p>
                      <p className="text-sm font-medium text-foreground">{kycData.aadhaarNumber || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">PAN Number</p>
                      <p className="text-sm font-medium text-foreground">{kycData.panNumber || "N/A"}</p>
                    </div>
                  </div>

                  {kycData.bankProofUrl && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Bank Proof</p>
                      <div className="space-y-1">
                        <a
                          href={kycData.bankProofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-sm"
                        >
                          View Document →
                        </a>
                        <p className="text-xs text-muted-foreground">
                          If this link expires, reopen this dialog to refresh the document URL.
                        </p>
                      </div>
                    </div>
                  )}
                  {!kycData.bankProofUrl && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Bank Proof</p>
                      <p className="text-sm text-red-500">
                        Bank proof unavailable. Ask user to re-upload KYC document.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Submitted At</p>
                      <p className="text-sm font-medium text-foreground">
                        {new Date(kycData.submittedAt).toLocaleString()}
                      </p>
                    </div>
                    {kycData.approvedAt && (
                      <div>
                        <p className="text-sm text-muted-foreground">Approved At</p>
                        <p className="text-sm font-medium text-foreground">
                          {new Date(kycData.approvedAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Action Section */}
              {kycData.status === "PENDING" && (
                <Card className="bg-muted/30 border-border">
                  <CardContent className="p-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reason" className="text-foreground">
                        Reason/Comment {kycData.status === "PENDING" && "(Required for rejection)"}
                      </Label>
                      <Textarea
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="bg-background border-border min-h-[100px]"
                        placeholder="Enter reason for approval or rejection..."
                      />
                    </div>

                    <div className="flex items-center justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false)
                          setReason("")
                        }}
                        disabled={loading}
                        className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        onClick={handleReject}
                        disabled={loading || !reason.trim()}
                        variant="destructive"
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {loading && action === "REJECTED" ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Rejecting...
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject KYC
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={handleApprove}
                        disabled={loading}
                        className="bg-green-500 hover:bg-green-600 text-white"
                      >
                        {loading && action === "APPROVED" ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve KYC
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {kycData.status !== "PENDING" && (
                <Alert className="bg-blue-500/10 border-blue-500/50">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <AlertDescription className="text-blue-500/80">
                    KYC status is already {kycData.status.toLowerCase()}. No action available.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
