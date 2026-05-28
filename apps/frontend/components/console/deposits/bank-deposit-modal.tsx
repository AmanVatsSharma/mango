"use client"

/**
 * @file bank-deposit-modal.tsx
 * @module components/console/deposits
 * @description Modal to show admin-configured domestic bank details and collect proof for a deposit request.
 * @author StockTrade
 * @created 2026-03-25
 */

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { DEPOSIT_PROOF_MAX_BYTES, uploadDepositProofFile } from "./upload-deposit-proof"
import { Copy } from "lucide-react"
import type { PublicBankDomesticPayload } from "@/lib/payment-deposit-public"

interface BankDepositModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  amount: number
  bank: PublicBankDomesticPayload | undefined
  onSuccess: (data: {
    reference?: string
    screenshotUrl?: string
    screenshotKey?: string
    selectedCompanyBankAccountId?: string
  }) => void
}

export function BankDepositModal({ open, onOpenChange, amount, bank, onSuccess }: BankDepositModalProps) {
  const [accountId, setAccountId] = useState<string>("")
  const [reference, setReference] = useState("")
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const accounts = bank?.accounts ?? []
  const accountIdsKey = accounts.map((a) => a.id).join("|")
  const selected = accounts.find((a) => a.id === accountId) ?? accounts[0]

  useEffect(() => {
    if (open && accounts.length) {
      setAccountId(accounts[0].id)
      setReference("")
      setScreenshot(null)
    }
  }, [open, accountIdsKey])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: "Copied" })
    } catch {
      toast({ title: "Copy failed", variant: "destructive" })
    }
  }

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
    if (bank?.requireProof && !reference.trim() && !screenshot) {
      toast({
        title: "Proof required",
        description: "Add a transaction reference or payment screenshot.",
        variant: "destructive",
      })
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
      onSuccess({
        reference: reference.trim() || undefined,
        screenshotUrl,
        screenshotKey,
        selectedCompanyBankAccountId: selected?.id,
      })
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

  if (!bank || accounts.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bank transfer</DialogTitle>
          <DialogDescription>
            Transfer ₹{amount.toLocaleString("en-IN")} using the details below, then submit proof.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={accountId} onValueChange={setAccountId} className="space-y-3">
          {accounts.map((acc) => (
            <Card key={acc.id} className={accountId === acc.id ? "ring-2 ring-primary" : ""}>
              <CardContent className="p-3 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={acc.id} id={acc.id} />
                  <Label htmlFor={acc.id} className="font-medium cursor-pointer">
                    {acc.bankName} — {acc.accountHolder}
                  </Label>
                </div>
                {accountId === acc.id ? (
                  <div className="pl-6 space-y-2 pt-2 text-muted-foreground">
                    <p>
                      A/c: <span className="font-mono text-foreground">{acc.accountNumber}</span>{" "}
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => copy(acc.accountNumber)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </p>
                    <p>
                      IFSC: <span className="font-mono text-foreground">{acc.ifsc}</span>{" "}
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => copy(acc.ifsc)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </p>
                    {acc.branch ? <p>Branch: {acc.branch}</p> : null}
                    {acc.instructions ? <p className="whitespace-pre-wrap text-xs">{acc.instructions}</p> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </RadioGroup>

        <div className="space-y-2">
          <Label>Your transaction reference (optional)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / IMPS ref / NEFT ref" />
        </div>
        <div className="space-y-2">
          <Label>Payment screenshot {bank.requireProof ? "(required)" : "(optional)"}</Label>
          <Input type="file" accept="image/*" onChange={onFile} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? "Submitting…" : "Submit deposit request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
