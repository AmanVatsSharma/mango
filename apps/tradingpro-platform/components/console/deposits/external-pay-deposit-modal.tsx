"use client"

/**
 * @file external-pay-deposit-modal.tsx
 * @module components/console/deposits
 * @description Opens admin-configured external pay URL and collects post-payment deposit proof.
 * @author StockTrade
 * @created 2026-03-25
 */

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { DEPOSIT_PROOF_MAX_BYTES, uploadDepositProofFile } from "./upload-deposit-proof"
import type { PublicExternalPayPayload } from "@/lib/payment-deposit-public"
import { ExternalLink } from "lucide-react"

interface ExternalPayDepositModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  amount: number
  externalPay: PublicExternalPayPayload | undefined
  onSuccess: (data: { reference?: string; screenshotUrl?: string; screenshotKey?: string }) => void
}

export function ExternalPayDepositModal({ open, onOpenChange, amount, externalPay, onSuccess }: ExternalPayDepositModalProps) {
  const [reference, setReference] = useState("")
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setReference("")
      setScreenshot(null)
    }
  }, [open])

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && f.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", variant: "destructive" })
      return
    }
    setScreenshot(f ?? null)
  }

  const openPay = () => {
    const u = externalPay?.url
    if (!u) {
      toast({ title: "Payment link not configured", variant: "destructive" })
      return
    }
    window.open(u, "_blank", "noopener,noreferrer")
  }

  const handleSubmit = async () => {
    if (externalPay?.requireProof && !reference.trim() && !screenshot) {
      toast({ title: "Add payment reference or screenshot", variant: "destructive" })
      return
    }
    setIsSubmitting(true)
    let screenshotUrl: string | undefined
    let screenshotKey: string | undefined
    try {
      if (screenshot) {
        const proof = await uploadDepositProofFile(screenshot)
        screenshotUrl = proof.url
        screenshotKey = proof.key
      }
      onSuccess({ reference: reference.trim() || undefined, screenshotUrl, screenshotKey })
      onOpenChange(false)
    } catch (e: unknown) {
      toast({
        title: "Submit failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!externalPay) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Online payment</DialogTitle>
          <DialogDescription>
            ₹{amount.toLocaleString("en-IN")} — complete payment in the opened page, then file your deposit here.
          </DialogDescription>
        </DialogHeader>
        {externalPay.disclaimer ? (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{externalPay.disclaimer}</p>
        ) : null}
        <Button type="button" variant="secondary" className="w-full gap-2" onClick={openPay}>
          <ExternalLink className="w-4 h-4" />
          {externalPay.buttonLabel || "Open payment page"}
        </Button>
        <div className="space-y-2">
          <Label>Payment reference / ID (optional)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Screenshot {externalPay.requireProof ? "(required)" : "(optional)"}</Label>
          <Input type="file" accept="image/*" onChange={onFile} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? "Submitting…" : "I have paid — submit deposit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
