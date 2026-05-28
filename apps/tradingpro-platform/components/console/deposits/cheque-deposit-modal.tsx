"use client"

/**
 * @file cheque-deposit-modal.tsx
 * @module components/console/deposits
 * @description Modal for cheque / DD instructions and proof.
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
import type { PublicChequePayload } from "@/lib/payment-deposit-public"

interface ChequeDepositModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  amount: number
  cheque: PublicChequePayload | undefined
  onSuccess: (data: { reference?: string; screenshotUrl?: string; screenshotKey?: string }) => void
}

export function ChequeDepositModal({ open, onOpenChange, amount, cheque, onSuccess }: ChequeDepositModalProps) {
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
    if (f && f.size > DEPOSIT_PROOF_MAX_BYTES) {
      toast({
        title: "File too large",
        description: `Max ${Math.round(DEPOSIT_PROOF_MAX_BYTES / (1024 * 1024))}MB`,
        variant: "destructive",
      })
      return
    }
    setScreenshot(f ?? null)
  }

  const handleSubmit = async () => {
    if (cheque?.requireProof && !reference.trim() && !screenshot) {
      toast({ title: "Cheque / DD number or scan required", variant: "destructive" })
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

  if (!cheque) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cheque / demand draft</DialogTitle>
          <DialogDescription>Amount: ₹{amount.toLocaleString("en-IN")}</DialogDescription>
        </DialogHeader>
        {cheque.instructions ? (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{cheque.instructions}</p>
        ) : null}
        <div className="space-y-2">
          <Label>Cheque / DD number {cheque.requireProof ? "(required)" : "(optional)"}</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Scan (optional)</Label>
          <Input type="file" accept="image/*" onChange={onFile} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
