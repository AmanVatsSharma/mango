"use client"

/**
 * @file crypto-deposit-modal.tsx
 * @module components/console/deposits
 * @description Modal for crypto deposit instructions, tx hash, and optional screenshot upload.
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
import type { PublicCryptoPayload } from "@/lib/payment-deposit-public"
import { Copy } from "lucide-react"

interface CryptoDepositModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  amount: number
  crypto: PublicCryptoPayload | undefined
  onSuccess: (data: {
    cryptoTxHash?: string
    screenshotUrl?: string
    screenshotKey?: string
    selectedCryptoWalletId?: string
    cryptoNetwork?: string
    cryptoAsset?: string
  }) => void
}

export function CryptoDepositModal({ open, onOpenChange, amount, crypto, onSuccess }: CryptoDepositModalProps) {
  const wallets = crypto?.wallets ?? []
  const walletIdsKey = wallets.map((w) => w.id).join("|")
  const [walletId, setWalletId] = useState("")
  const [txHash, setTxHash] = useState("")
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const selected = wallets.find((w) => w.id === walletId) ?? wallets[0]

  useEffect(() => {
    if (open && wallets.length) {
      setWalletId(wallets[0].id)
      setTxHash("")
      setScreenshot(null)
    }
  }, [open, walletIdsKey])

  const copyText = async (text: string) => {
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
    if (crypto?.requireProof && (!txHash.trim() || txHash.trim().length < 8)) {
      toast({
        title: "Transaction hash required",
        description: "Enter a valid transaction hash.",
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
        cryptoTxHash: txHash.trim() || undefined,
        screenshotUrl,
        screenshotKey,
        selectedCryptoWalletId: selected?.id,
        cryptoNetwork: selected?.network,
        cryptoAsset: selected?.asset,
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

  if (!crypto || wallets.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crypto deposit</DialogTitle>
          <DialogDescription>
            Ledger amount: ₹{amount.toLocaleString("en-IN")}. Send crypto as instructed, then submit your transaction hash.
          </DialogDescription>
        </DialogHeader>

        {wallets.length > 1 ? (
          <div className="space-y-2">
            <Label>Wallet</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.asset} — {w.network}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {selected ? (
          <div className="rounded-md border border-border p-3 space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Asset:</span> {selected.asset}
            </p>
            <p>
              <span className="text-muted-foreground">Network:</span> {selected.network}
            </p>
            <p className="break-all">
              <span className="text-muted-foreground">Address:</span>{" "}
              <span className="font-mono">{selected.address}</span>{" "}
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyText(selected.address)}>
                <Copy className="w-3 h-3" />
              </Button>
            </p>
            {selected.memoOrTag ? (
              <p>
                <span className="text-muted-foreground">Memo / tag:</span> {selected.memoOrTag}
              </p>
            ) : null}
            {selected.instructions ? (
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">{selected.instructions}</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>Transaction hash {crypto.requireProof ? "(required)" : "(recommended)"}</Label>
          <Input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x… or explorer hash" />
        </div>
        <div className="space-y-2">
          <Label>Screenshot (optional)</Label>
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
