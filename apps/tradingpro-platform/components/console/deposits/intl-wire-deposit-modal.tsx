"use client"

/**
 * @file intl-wire-deposit-modal.tsx
 * @module components/console/deposits
 * @description Modal for international wire instructions and proof submission.
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
import type { PublicBankIntlPayload } from "@/lib/payment-deposit-public"
import { Copy } from "lucide-react"

interface IntlWireDepositModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  amount: number
  wire: PublicBankIntlPayload | undefined
  onSuccess: (data: {
    reference?: string
    screenshotUrl?: string
    screenshotKey?: string
    selectedCompanyBankAccountId?: string
  }) => void
}

export function IntlWireDepositModal({ open, onOpenChange, amount, wire, onSuccess }: IntlWireDepositModalProps) {
  const accounts = wire?.accounts ?? []
  const accountIdsKey = accounts.map((a) => a.id).join("|")
  const [accountId, setAccountId] = useState("")
  const [reference, setReference] = useState("")
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

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
    if (wire?.requireProof && !reference.trim() && !screenshot) {
      toast({ title: "Add wire reference or proof", variant: "destructive" })
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

  if (!wire || accounts.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>International wire</DialogTitle>
          <DialogDescription>
            Ledger amount: ₹{amount.toLocaleString("en-IN")}. Use the selected beneficiary; then submit proof.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={accountId} onValueChange={setAccountId} className="space-y-3">
          {accounts.map((acc) => (
            <Card key={acc.id} className={accountId === acc.id ? "ring-2 ring-primary" : ""}>
              <CardContent className="p-3 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={acc.id} id={`wire-${acc.id}`} />
                  <Label htmlFor={`wire-${acc.id}`} className="font-medium cursor-pointer">
                    {acc.bankName} — {acc.beneficiary}
                  </Label>
                </div>
                {accountId === acc.id ? (
                  <div className="pl-6 space-y-1 pt-2">
                    <p className="break-all">
                      IBAN / A/c: {acc.ibanOrAccount}{" "}
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => copy(acc.ibanOrAccount)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </p>
                    <p>
                      SWIFT: {acc.swift}{" "}
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => copy(acc.swift)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </p>
                    {acc.currency ? <p>Currency: {acc.currency}</p> : null}
                    {acc.instructions ? <p className="whitespace-pre-wrap text-xs text-muted-foreground">{acc.instructions}</p> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </RadioGroup>

        <div className="space-y-2">
          <Label>Wire reference (optional)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Proof screenshot {wire.requireProof ? "(required)" : "(optional)"}</Label>
          <Input type="file" accept="image/*" onChange={onFile} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? "Submitting…" : "Submit deposit request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
