/**
 * File:        components/console/withdrawals/withdrawal-request-form.tsx
 * Module:      Console · Withdrawals
 * Purpose:     User-facing form to submit a single withdrawal request with amount + bank selection; hard-blocks submission while a prior request is still in-flight.
 *
 * Exports:
 *   - WithdrawalRequestForm(props)  — React component; props: { bankAccounts, availableBalance, onSubmit, hasPendingRequest? }
 *
 * Depends on:
 *   - @/hooks/use-toast — user-visible validation feedback
 *   - @/components/console/console-number-utils — amount normalization
 *   - ./withdrawal-types — shared BankAccount shape
 *
 * Side-effects:
 *   - Calls onSubmit(amount, bankAccountId) which triggers a server-side withdrawal create
 *
 * Key invariants:
 *   - Submission is blocked both client-side (via hasPendingRequest) and server-side (ConsoleService.createWithdrawalRequest). The server is authoritative; the client prop is UX only.
 *   - Minimum amount ₹100; amount must not exceed availableBalance.
 *
 * Read order:
 *   1. WithdrawalRequestFormProps — prop shape
 *   2. handleSubmit             — validation order (in-flight → amount → balance → bank)
 *   3. JSX                      — notice alert + disabled-button states
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-20
 */

"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Building2, ArrowRight, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import type { BankAccount } from "./withdrawal-types"
import { normalizeConsoleAmountInput } from "@/components/console/console-number-utils"

interface WithdrawalRequestFormProps {
  bankAccounts: BankAccount[]
  availableBalance: number
  onSubmit: (amount: number, bankAccountId: string) => void
  hasPendingRequest?: boolean
}

export function WithdrawalRequestForm({
  bankAccounts,
  availableBalance,
  onSubmit,
  hasPendingRequest = false,
}: WithdrawalRequestFormProps) {
  const [amount, setAmount] = useState("")
  const [selectedBankId, setSelectedBankId] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const quickAmounts = [5000, 10000, 25000, 50000]

  const selectedBank = bankAccounts.find((bank) => bank.id === selectedBankId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (hasPendingRequest) {
      toast({
        title: "Request already in progress",
        description:
          "You already have a withdrawal awaiting action. Wait for it to be approved or rejected before submitting another.",
        variant: "destructive",
      })
      return
    }

    const withdrawalAmount = normalizeConsoleAmountInput(amount)

    if (!withdrawalAmount || withdrawalAmount < 100) {
      toast({
        title: "Invalid Amount",
        description: "Minimum withdrawal amount is ₹100",
        variant: "destructive",
      })
      return
    }

    if (withdrawalAmount > availableBalance) {
      toast({
        title: "Insufficient Balance",
        description: "Withdrawal amount exceeds available balance",
        variant: "destructive",
      })
      return
    }

    if (!selectedBankId) {
      toast({
        title: "Bank Account Required",
        description: "Please select a bank account for withdrawal",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    // Simulate processing delay
    setTimeout(() => {
      setIsLoading(false)
      onSubmit(withdrawalAmount, selectedBankId)
      setAmount("")
      setSelectedBankId("")
      toast({
        title: "Withdrawal Requested",
        description: "Your withdrawal request has been submitted successfully",
      })
    }, 1000)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* In-flight Request Notice — only one withdrawal at a time */}
      {hasPendingRequest && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            You already have a withdrawal request awaiting action. You can submit a new one only
            after it is approved or rejected.
          </AlertDescription>
        </Alert>
      )}

      {/* Available Balance Info */}
      <div className="p-4 bg-muted/50 rounded-lg border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Available Balance</span>
          <span className="text-lg font-semibold text-green-600">₹{availableBalance.toLocaleString("en-IN")}</span>
        </div>
      </div>

      {/* Amount Input */}
      <div className="space-y-3">
        <Label htmlFor="amount" className="text-base font-medium">
          Withdrawal Amount
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
            min="100"
            max={availableBalance}
            step="100"
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Minimum: ₹100 | Maximum: ₹{availableBalance.toLocaleString("en-IN")}
        </p>
      </div>

      {/* Quick Amount Buttons */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Quick Select</Label>
        <div className="grid grid-cols-2 gap-2">
          {quickAmounts
            .filter((quickAmount) => quickAmount <= availableBalance)
            .map((quickAmount) => (
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

      {/* Bank Account Selection */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Select Bank Account</Label>
        <Select value={selectedBankId} onValueChange={setSelectedBankId}>
          <SelectTrigger className="h-12 bg-transparent">
            <SelectValue placeholder="Choose bank account" />
          </SelectTrigger>
          <SelectContent>
            {bankAccounts.map((bank) => (
              <SelectItem key={bank.id} value={bank.id}>
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4" />
                  <div>
                    <div className="font-medium">{bank.bankName}</div>
                    <div className="text-sm text-muted-foreground">
                      ****{bank.accountNumber.slice(-4)} {bank.isDefault && "(Default)"}
                    </div>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Selected Bank Details */}
      {selectedBank && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{selectedBank.bankName}</span>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Account: ****{selectedBank.accountNumber.slice(-4)}</p>
                  <p>IFSC: {selectedBank.ifscCode}</p>
                  <p>Holder: {selectedBank.accountHolderName}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Processing Info */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Withdrawals are processed within 1-2 business days. No charges apply for withdrawals above ₹1,000.
        </AlertDescription>
      </Alert>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full h-12 text-base"
        disabled={isLoading || !amount || !selectedBankId || hasPendingRequest}
      >
        {isLoading ? (
          "Processing Request..."
        ) : hasPendingRequest ? (
          "Awaiting previous request"
        ) : (
          <>
            Request Withdrawal
            <ArrowRight className="w-4 h-4 ml-2" />
          </>
        )}
      </Button>
    </form>
  )
}
