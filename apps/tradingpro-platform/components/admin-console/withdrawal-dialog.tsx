"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, X, User, DollarSign, CreditCard, Calendar, FileText, Hash } from "lucide-react"

interface WithdrawalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: any
}

export function WithdrawalDialog({ open, onOpenChange, request }: WithdrawalDialogProps) {
  const [action, setAction] = useState<"approve" | "reject" | null>(null)
  const [transactionId, setTransactionId] = useState("")
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
      setTransactionId("")
      setReason("")
    }, 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="text-lg sm:text-xl font-bold text-primary">Withdrawal Request Details</DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-muted-foreground">
            Review and process the withdrawal request
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
                    <span className="font-bold text-red-400 text-lg">${request.amount.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center">
                      <CreditCard className="w-4 h-4 mr-2" />
                      Method:
                    </span>
                    <Badge className="bg-purple-400/20 text-purple-400 border-purple-400/30">{request.method}</Badge>
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
                  <div>
                    <span className="text-muted-foreground block mb-1">Account Details:</span>
                    <p className="text-foreground font-mono text-sm bg-muted/50 p-2 rounded">
                      {request.accountDetails}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge
                      className={
                        request.status === "pending"
                          ? "bg-yellow-400/20 text-yellow-400 border-yellow-400/30"
                          : request.status === "processing"
                            ? "bg-blue-400/20 text-blue-400 border-blue-400/30"
                            : request.status === "completed"
                              ? "bg-green-400/20 text-green-400 border-green-400/30"
                              : "bg-red-400/20 text-red-400 border-red-400/30"
                      }
                    >
                      {request.status}
                    </Badge>
                  </div>

                  {request.transactionId && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Transaction ID:</span>
                      <code className="text-green-400 font-mono text-sm bg-green-400/10 px-2 py-1 rounded">
                        {request.transactionId}
                      </code>
                    </div>
                  )}

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

          {/* Action Buttons */}
          {request.status === "pending" && !action && (
            <div className="flex items-center justify-center space-x-4">
              <Button
                onClick={() => setAction("approve")}
                className="bg-green-400 hover:bg-green-400/90 text-black"
                disabled={isProcessing}
              >
                <Check className="w-4 h-4 mr-2" />
                Process Withdrawal
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
                    {action === "approve" ? "Process Withdrawal" : "Reject Withdrawal"}
                  </h3>
                  <div className="space-y-4">
                    {action === "approve" && (
                      <div>
                        <label className="text-sm font-medium text-foreground mb-2 block flex items-center">
                          <Hash className="w-4 h-4 mr-2" />
                          Transaction ID
                        </label>
                        <Input
                          value={transactionId}
                          onChange={(e) => setTransactionId(e.target.value)}
                          placeholder="Enter transaction ID for the withdrawal"
                          className="bg-muted/50 border-border focus:border-primary"
                          required
                        />
                      </div>
                    )}

                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        {action === "approve" ? "Processing Notes (Optional)" : "Rejection Reason"}
                      </label>
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={
                          action === "approve"
                            ? "Add any notes about the withdrawal processing..."
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
                        disabled={
                          isProcessing ||
                          (action === "reject" && !reason.trim()) ||
                          (action === "approve" && !transactionId.trim())
                        }
                      >
                        {isProcessing
                          ? "Processing..."
                          : action === "approve"
                            ? "Confirm Processing"
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
