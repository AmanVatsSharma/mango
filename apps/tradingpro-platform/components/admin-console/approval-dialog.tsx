"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, X, Eye, User, DollarSign, CreditCard, Calendar, FileText } from "lucide-react"

interface ApprovalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: any
}

export function ApprovalDialog({ open, onOpenChange, request }: ApprovalDialogProps) {
  const [action, setAction] = useState<"approve" | "reject" | null>(null)
  const [reason, setReason] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  if (!request) return null

  const handleAction = async (actionType: "approve" | "reject") => {
    setIsProcessing(true)
    // Simulate API call
    setTimeout(() => {
      setIsProcessing(false)
      onOpenChange(false)
      setAction(null)
      setReason("")
    }, 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="text-lg sm:text-xl font-bold text-primary">Fund Request Details</DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-muted-foreground">
            Review and approve or reject the fund deposit request
          </DialogDescription>
        </DialogHeader>

        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Request Details */}
          <Card className="bg-muted/30 border-border">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      User:
                    </span>
                    <div className="text-right">
                      <p className="font-medium text-foreground">{request.userName}</p>
                      <p className="text-sm text-muted-foreground">{request.userId}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Amount:
                    </span>
                    <span className="font-bold text-green-400 text-lg">${request.amount.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center">
                      <CreditCard className="w-4 h-4 mr-2" />
                      Method:
                    </span>
                    <Badge className="bg-blue-400/20 text-blue-400 border-blue-400/30">{request.method}</Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      Date:
                    </span>
                    <span className="text-foreground">{request.requestDate}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">UTR Code:</span>
                    <code className="text-primary font-mono text-sm bg-primary/10 px-2 py-1 rounded">
                      {request.utrCode}
                    </code>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge
                      className={
                        request.status === "pending"
                          ? "bg-yellow-400/20 text-yellow-400 border-yellow-400/30"
                          : request.status === "approved"
                            ? "bg-green-400/20 text-green-400 border-green-400/30"
                            : "bg-red-400/20 text-red-400 border-red-400/30"
                      }
                    >
                      {request.status}
                    </Badge>
                  </div>

                  {request.description && (
                    <div>
                      <span className="text-muted-foreground flex items-center mb-2">
                        <FileText className="w-4 h-4 mr-2" />
                        Description:
                      </span>
                      <p className="text-sm text-foreground bg-muted/50 p-2 rounded">{request.description}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Screenshot */}
          <Card className="bg-muted/30 border-border">
            <CardContent className="p-6">
              <h3 className="text-lg font-bold text-primary mb-4 flex items-center">
                <Eye className="w-5 h-5 mr-2" />
                Transaction Screenshot
              </h3>
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <img
                  src={request.screenshot || "/placeholder.svg"}
                  alt="Transaction Screenshot"
                  className="w-full max-w-md mx-auto rounded-lg border border-border"
                />
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          {request.status === "pending" && !action && (
            <div className="flex items-center justify-center space-x-4">
              <Button
                onClick={() => setAction("approve")}
                className="bg-green-400 hover:bg-green-400/90 text-black"
                disabled={isProcessing}
              >
                <Check className="w-4 h-4 mr-2" />
                Approve Request
              </Button>
              <Button
                onClick={() => setAction("reject")}
                variant="destructive"
                className="bg-red-400 hover:bg-red-400/90"
                disabled={isProcessing}
              >
                <X className="w-4 h-4 mr-2" />
                Reject Request
              </Button>
            </div>
          )}

          {/* Action Form */}
          {action && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-6">
                  <h3 className="text-lg font-bold text-primary mb-4">
                    {action === "approve" ? "Approve Request" : "Reject Request"}
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        {action === "approve" ? "Approval Notes (Optional)" : "Rejection Reason"}
                      </label>
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={
                          action === "approve"
                            ? "Add any notes about the approval..."
                            : "Please provide a reason for rejection..."
                        }
                        className="bg-muted/50 border-border focus:border-primary resize-none"
                        rows={3}
                        required={action === "reject"}
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => handleAction(action)}
                        className={
                          action === "approve"
                            ? "bg-green-400 hover:bg-green-400/90 text-black"
                            : "bg-red-400 hover:bg-red-400/90"
                        }
                        disabled={isProcessing || (action === "reject" && !reason.trim())}
                      >
                        {isProcessing
                          ? "Processing..."
                          : action === "approve"
                            ? "Confirm Approval"
                            : "Confirm Rejection"}
                      </Button>
                      <Button variant="outline" onClick={() => setAction(null)} disabled={isProcessing}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
