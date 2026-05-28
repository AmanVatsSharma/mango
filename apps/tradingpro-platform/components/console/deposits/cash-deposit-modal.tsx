"use client"

/**
 * @file cash-deposit-modal.tsx
 * @module components/console/deposits
 * @description Modal for cash / branch deposit instructions and optional proof.
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
import type { PublicCashPayload } from "@/lib/payment-deposit-public"

interface CashDepositModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  amount: number
  cash: PublicCashPayload | undefined
  onSuccess: (data: { reference?: string; screenshotUrl?: string; screenshotKey?: string }) => void
}

export function CashDepositModal({ open, onOpenChange, amount, cash, onSuccess }: CashDepositModalProps) {
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
    if (cash?.requireProof && !reference.trim() && !screenshot) {
      toast({ title: "Add reference or receipt image", variant: "destructive" })
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

  if (!cash) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cash / branch deposit</DialogTitle>
          <DialogDescription>Amount: ₹{amount.toLocaleString("en-IN")}</DialogDescription>
        </DialogHeader>
        {cash.instructions ? (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{cash.instructions}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Follow branch instructions for cash deposits.</p>
        )}
        <div className="space-y-2">
          <Label>Reference / receipt no. (optional)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Receipt screenshot {cash.requireProof ? "(required)" : "(optional)"}</Label>
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
