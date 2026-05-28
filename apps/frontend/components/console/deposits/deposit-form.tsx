"use client"

/**
 * @file deposit-form.tsx
 * @module components/console/deposits
 * @description Dynamic deposit method selector driven by admin `payment_deposit_config_v1` public payload.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-25 — Payment settings load error + retry; distinct loading vs error vs ready.
 */

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  Smartphone,
  Building2,
  Banknote,
  Wallet,
  Globe,
  FileText,
  ExternalLink,
  ArrowRight,
  Loader2,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { normalizeConsoleAmountInput } from "@/components/console/console-number-utils"
import {
  getAmountBoundsForMethod,
  type PublicPaymentDepositMethodId,
  type PublicPaymentDepositSettingsV1,
} from "@/lib/payment-deposit-public"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const PAYABLE_METHODS: PublicPaymentDepositMethodId[] = [
  "upi",
  "bank",
  "cash",
  "crypto",
  "wire_intl",
  "cheque",
  "external_pay",
]

const METHOD_ICONS: Record<PublicPaymentDepositMethodId, LucideIcon> = {
  upi: Smartphone,
  bank: Building2,
  cash: Banknote,
  crypto: Wallet,
  wire_intl: Globe,
  cheque: FileText,
  external_pay: ExternalLink,
  contact_support: ExternalLink,
}

function methodLabel(
  settings: PublicPaymentDepositSettingsV1,
  id: PublicPaymentDepositMethodId
): string {
  const block = settings.methods[id] as { clientTitle?: string } | undefined
  if (block?.clientTitle?.trim()) return block.clientTitle.trim()
  const fallback: Record<PublicPaymentDepositMethodId, string> = {
    upi: "UPI",
    bank: "Bank transfer (India)",
    cash: "Cash / branch",
    crypto: "Crypto",
    wire_intl: "International wire",
    cheque: "Cheque / DD",
    external_pay: "Online payment link",
    contact_support: "Support",
  }
  return fallback[id]
}

function methodDescription(settings: PublicPaymentDepositSettingsV1, id: PublicPaymentDepositMethodId): string {
  const block = settings.methods[id] as { clientDescription?: string } | undefined
  if (block?.clientDescription?.trim()) return block.clientDescription.trim()
  const fallback: Record<PublicPaymentDepositMethodId, string> = {
    upi: "Instant UPI transfer",
    bank: "NEFT / IMPS / RTGS to our account",
    cash: "Deposit at branch per instructions",
    crypto: "USDT / USDC and other supported assets",
    wire_intl: "SWIFT / international transfer",
    cheque: "Cheque or demand draft",
    external_pay: "Pay via our payment page",
    contact_support: "Get help from the team",
  }
  return fallback[id]
}

interface DepositFormProps {
  paymentSettings: PublicPaymentDepositSettingsV1 | null
  /** Set when /api/settings/payment fails (distinct from "still loading"). */
  paymentSettingsError?: string | null
  paymentSettingsLoading?: boolean
  onRetryPaymentSettings?: () => void
  onSubmit: (amount: number, method: PublicPaymentDepositMethodId) => void
}

export function DepositForm({
  paymentSettings,
  paymentSettingsError = null,
  paymentSettingsLoading = false,
  onRetryPaymentSettings,
  onSubmit,
}: DepositFormProps) {
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PublicPaymentDepositMethodId>("upi")
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const quickAmounts = [1000, 5000, 10000, 25000, 50000, 100000]

  const payableOptions = useMemo(() => {
    if (!paymentSettings) return []
    const order = paymentSettings.order?.length ? paymentSettings.order : []
    return order.filter(
      (id): id is PublicPaymentDepositMethodId =>
        PAYABLE_METHODS.includes(id) && Boolean(paymentSettings.methods[id])
    )
  }, [paymentSettings])

  useEffect(() => {
    if (payableOptions.length && !payableOptions.includes(method)) {
      setMethod(payableOptions[0])
    }
  }, [payableOptions, method])

  const bounds = getAmountBoundsForMethod(paymentSettings, method)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const depositAmount = normalizeConsoleAmountInput(amount)

    if (!depositAmount || depositAmount < bounds.min) {
      toast({
        title: "Invalid Amount",
        description: `Minimum deposit for this method is ₹${bounds.min.toLocaleString("en-IN")}`,
        variant: "destructive",
      })
      return
    }

    if (depositAmount > bounds.max) {
      toast({
        title: "Amount Limit Exceeded",
        description: `Maximum for this method is ₹${bounds.max.toLocaleString("en-IN")}`,
        variant: "destructive",
      })
      return
    }

    if (payableOptions.length === 0) {
      toast({
        title: "No methods available",
        description: "Ask your admin to enable deposit options.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    setTimeout(() => {
      setIsLoading(false)
      onSubmit(depositAmount, method)
      setAmount("")
    }, 400)
  }

  const support = paymentSettings?.methods.contact_support

  if (paymentSettingsLoading || (!paymentSettings && !paymentSettingsError)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        <span>Loading payment options…</span>
      </div>
    )
  }

  if (paymentSettingsError && !paymentSettings) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load payment options</AlertTitle>
        <AlertDescription className="space-y-3">
          <p className="text-sm">{paymentSettingsError}</p>
          {onRetryPaymentSettings ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void onRetryPaymentSettings()}>
              Try again
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    )
  }

  if (!paymentSettings) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">Loading payment options…</div>
    )
  }

  if (payableOptions.length === 0) {
    return (
      <Alert>
        <AlertTitle>No deposit methods enabled</AlertTitle>
        <AlertDescription>Your administrator has not enabled any funding method yet.</AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <Label htmlFor="amount" className="text-base font-medium">
          Deposit Amount
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">₹</span>
          <Input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            className="pl-8 text-lg h-12"
            min={bounds.min}
            max={bounds.max}
            step="100"
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Min: ₹{bounds.min.toLocaleString("en-IN")} | Max: ₹{bounds.max.toLocaleString("en-IN")}
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Quick Select</Label>
        <div className="grid grid-cols-3 gap-2">
          {quickAmounts.map((quickAmount) => (
            <Button
              key={quickAmount}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAmount(quickAmount.toString())}
              className="text-xs bg-transparent"
            >
              ₹{quickAmount.toLocaleString("en-IN")}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-base font-medium">Payment Method</Label>
        <RadioGroup
          value={method}
          onValueChange={(v) => setMethod(v as PublicPaymentDepositMethodId)}
        >
          <div className="space-y-3">
            {payableOptions.map((paymentMethodId) => {
              const Icon = METHOD_ICONS[paymentMethodId]
              const meta = paymentSettings.methods[paymentMethodId] as
                | { recommended?: boolean; badgeText?: string }
                | undefined
              const badge = meta?.badgeText || (meta?.recommended ? "Recommended" : null)
              return (
                <motion.div key={paymentMethodId} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Card
                    className={`cursor-pointer transition-all ${
                      method === paymentMethodId ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                    onClick={() => setMethod(paymentMethodId)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value={paymentMethodId} id={paymentMethodId} />
                        <div className="flex items-center gap-3 flex-1">
                          <div className="p-2 bg-muted rounded-lg">
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={paymentMethodId} className="font-medium cursor-pointer">
                                {methodLabel(paymentSettings, paymentMethodId)}
                              </Label>
                              {badge ? (
                                <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                                  {badge}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {methodDescription(paymentSettings, paymentMethodId)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </RadioGroup>
      </div>

      {support ? (
        <Alert>
          <AlertTitle>{support.title || "Need help?"}</AlertTitle>
          <AlertDescription className="space-y-1 text-sm">
            {support.body ? <p className="whitespace-pre-wrap">{support.body}</p> : null}
            <div className="flex flex-wrap gap-2 pt-1">
              {support.phone ? (
                <a href={`tel:${support.phone}`} className="text-primary underline">
                  {support.phone}
                </a>
              ) : null}
              {support.email ? (
                <a href={`mailto:${support.email}`} className="text-primary underline">
                  {support.email}
                </a>
              ) : null}
              {support.whatsapp ? (
                <a
                  href={`https://wa.me/${support.whatsapp.replace(/\D/g, "")}`}
                  className="text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" className="w-full h-12 text-base" disabled={isLoading || !amount}>
        {isLoading ? (
          "Processing..."
        ) : (
          <>
            Proceed to Payment
            <ArrowRight className="w-4 h-4 ml-2" />
          </>
        )}
      </Button>
    </form>
  )
}
