"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { QrCode, Clock, CheckCircle, Copy, Camera } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { DEPOSIT_PROOF_MAX_BYTES, uploadDepositProofFile } from "./upload-deposit-proof"

interface UPIPaymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  amount: number
  onSuccess: (data: {
    utr?: string
    screenshotUrl?: string
    screenshotKey?: string
    selectedUpiItemId?: string
  }) => void
  /** Preferred: multiple UPI entries from admin config */
  upiOptions?: Array<{ id: string; label?: string; upiId: string; qrCodeUrl?: string }>
  /** Legacy single UPI */
  upiId?: string
  qrCodeUrl?: string
}

export function UPIPaymentModal({
  open,
  onOpenChange,
  amount,
  onSuccess,
  upiOptions,
  upiId,
  qrCodeUrl,
}: UPIPaymentModalProps) {
  const [step, setStep] = useState<"qr" | "details" | "success">("qr")
  const [timeLeft, setTimeLeft] = useState(300) // 5 minutes
  const [utr, setUtr] = useState("")
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const { toast } = useToast()

  const options =
    upiOptions && upiOptions.length > 0
      ? upiOptions
      : [{ id: "legacy", label: "UPI", upiId: upiId || "trading@paytm", qrCodeUrl }]

  const safeIdx = Math.min(activeIdx, Math.max(0, options.length - 1))
  const current = options[safeIdx] ?? options[0]
  const fallbackQrCodeUrl = `/placeholder.svg?height=200&width=200&query=UPI QR code for payment of ₹${amount}`

  const effectiveUpiId = current?.upiId?.trim() || "trading@paytm"
  const effectiveQrCodeUrl = (current?.qrCodeUrl || qrCodeUrl || fallbackQrCodeUrl).trim() || fallbackQrCodeUrl

  useEffect(() => {
    if (open) {
      setActiveIdx(0)
    }
  }, [open])

  // Countdown timer
  useEffect(() => {
    if (!open || step !== "qr") return

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          toast({
            title: "Session Expired",
            description: "Please try again with a new payment session",
            variant: "destructive",
          })
          onOpenChange(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [open, step, onOpenChange, toast])

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep("qr")
      setTimeLeft(300)
      setUtr("")
      setScreenshot(null)
      setIsSubmitting(false)
    }
  }, [open])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const copyUPIId = async () => {
    try {
      await navigator.clipboard.writeText(effectiveUpiId)
      toast({
        title: "Copied!",
        description: "UPI ID copied to clipboard",
      })
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please copy manually",
        variant: "destructive",
      })
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > DEPOSIT_PROOF_MAX_BYTES) {
        toast({
          title: "File too large",
          description: `Please upload an image smaller than ${Math.round(DEPOSIT_PROOF_MAX_BYTES / (1024 * 1024))}MB`,
          variant: "destructive",
        })
        return
      }
      setScreenshot(file)
    }
  }

  const handleSubmit = async () => {
    // UTR optional; validate only if provided
    if (utr && utr.length !== 12) {
      toast({
        title: "Invalid UTR",
        description: "UTR number must be exactly 12 digits",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    let uploadedUrl: string | undefined
    let uploadedKey: string | undefined

    try {
      if (screenshot) {
        const proof = await uploadDepositProofFile(screenshot)
        uploadedUrl = proof.url
        uploadedKey = proof.key
      }

      setStep("success")
      setTimeout(() => {
        onSuccess({
          utr: utr || undefined,
          screenshotUrl: uploadedUrl,
          screenshotKey: uploadedKey,
          selectedUpiItemId: current?.id,
        })
      }, 600)
    } catch (e: any) {
      console.error('❌ [UPI-MODAL] Upload failed', e)
      toast({ title: 'Upload failed', description: e?.message || 'Please try again', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md lg:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            UPI Payment
          </DialogTitle>
          <DialogDescription>Complete your deposit of ₹{amount.toLocaleString("en-IN")}</DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === "qr" && (
            <motion.div
              key="qr"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {/* Timer */}
              <div className="flex items-center justify-center">
                <Badge variant="outline" className="gap-2">
                  <Clock className="w-4 h-4" />
                  {formatTime(timeLeft)}
                </Badge>
              </div>

              {options.length > 1 ? (
                <p className="text-sm text-center text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md px-3 py-2">
                  If this QR or ID does not work in your app, switch to another UPI option below.
                </p>
              ) : null}

              {options.length > 1 ? (
                <div className="flex flex-wrap gap-2 justify-center">
                  {options.map((opt, idx) => (
                    <Button
                      key={opt.id}
                      type="button"
                      size="sm"
                      variant={safeIdx === idx ? "default" : "outline"}
                      onClick={() => {
                        setActiveIdx(idx)
                        setStep("qr")
                        setTimeLeft(300)
                      }}
                    >
                      {opt.label || `UPI ${idx + 1}`}
                    </Button>
                  ))}
                </div>
              ) : null}

              {/* QR Code */}
              <Card>
                <CardContent className="p-6 text-center">
                  <div className="flex justify-center mb-4">
                    <img
                      src={effectiveQrCodeUrl || "/placeholder.svg"}
                      alt="UPI QR Code"
                      className="w-48 h-48 border rounded-lg"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">Scan with any UPI app</p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-sm font-mono">{effectiveUpiId}</span>
                    <Button variant="ghost" size="sm" onClick={copyUPIId} className="h-6 w-6 p-0">
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Instructions */}
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>1. Scan the QR code with your UPI app</p>
                <p>2. Verify the amount: ₹{amount.toLocaleString("en-IN")}</p>
                <p>3. Complete the payment</p>
                <p>4. Note down the UTR number</p>
              </div>

              <Button onClick={() => setStep("details")} className="w-full">
                I've Made the Payment
              </Button>
            </motion.div>
          )}

          {step === "details" && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {/* UTR Input */}
              <div className="space-y-2">
                <Label htmlFor="utr">UTR Number (Optional but Recommended)</Label>
                <Input
                  id="utr"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="Enter 12-digit UTR number"
                  maxLength={12}
                />
                <p className="text-xs text-muted-foreground">UTR helps us process your deposit faster</p>
              </div>

              {/* Screenshot Upload */}
              <div className="space-y-2">
                <Label>Payment Screenshot (Optional)</Label>
                <div className="border-2 border-dashed border-muted rounded-lg p-4">
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" id="screenshot" />
                  <label htmlFor="screenshot" className="cursor-pointer">
                    <div className="text-center">
                      {screenshot ? (
                        <div className="flex items-center justify-center gap-2 text-green-600">
                          <CheckCircle className="w-5 h-5" />
                          <span className="text-sm">{screenshot.name}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Camera className="w-8 h-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Click to upload payment screenshot</span>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("qr")} className="flex-1">
                  Back
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? "Submitting..." : "Submit Details"}
                </Button>
              </div>
            </motion.div>
          )}

          {step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center space-y-4"
            >
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Payment Submitted!</h3>
                <p className="text-muted-foreground">Your deposit request has been submitted for processing</p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-sm">
                <p>Amount: ₹{amount.toLocaleString("en-IN")}</p>
                {utr && <p>UTR: {utr}</p>}
                <p className="text-muted-foreground mt-2">Processing time: 5-10 minutes</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
