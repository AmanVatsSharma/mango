"use client"

/**
 * File:        components/console/sections/withdrawals-section.tsx
 * Module:      Console · Withdrawals
 * Purpose:     Withdrawals workspace: summary cards, request form, and history list; enforces the single-in-flight-request rule at the UI layer.
 *
 * Exports:
 *   - WithdrawalsSection()        — React component rendering the full withdrawals page
 *   - BankAccount, WithdrawalRecord (re-exports) — forwarded from ../withdrawals/withdrawal-types
 *
 * Depends on:
 *   - @/lib/hooks/use-console-data — fetches consoleData + exposes createWithdrawalRequest
 *   - ../withdrawals/withdrawal-request-form — form component (receives hasPendingRequest)
 *   - ../withdrawals/withdrawals-list — history list
 *
 * Side-effects:
 *   - Triggers server POST via createWithdrawalRequest on submit
 *   - Shows toasts for success / failure
 *
 * Key invariants:
 *   - hasPendingRequest is derived from pendingWithdrawals (PENDING or PROCESSING). The server enforces the same rule authoritatively.
 *   - availableBalance falls back: availableMargin → balance → 0.
 *
 * Read order:
 *   1. WithdrawalsSection           — top-level composition
 *   2. handleWithdrawalRequest      — submit flow
 *   3. derived totals               — stat cards source of truth
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-20
 */

import { motion } from "framer-motion"
import { ArrowUpFromLine, Building2, Clock, CheckCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WithdrawalRequestForm } from "../withdrawals/withdrawal-request-form"
import { WithdrawalsList } from "../withdrawals/withdrawals-list"
import { mapConsoleWithdrawalToRecord } from "../withdrawals/map-console-withdrawal"
import { useSession } from "next-auth/react"
import { useConsoleData } from "@/lib/hooks/use-console-data"
import { useToast } from "@/hooks/use-toast"
import { normalizeConsoleNonNegativeNumber } from "@/components/console/console-number-utils"
import type { BankAccount, WithdrawalRecord } from "../withdrawals/withdrawal-types"

export type { BankAccount, WithdrawalRecord } from "../withdrawals/withdrawal-types"

const mockBankAccounts: BankAccount[] = [
  {
    id: "BA001",
    bankName: "HDFC Bank",
    accountNumber: "50100123456789",
    ifscCode: "HDFC0001234",
    accountHolderName: "John Doe",
    accountType: "savings",
    isDefault: true,
  },
  {
    id: "BA002",
    bankName: "ICICI Bank",
    accountNumber: "123456789012",
    ifscCode: "ICIC0001234",
    accountHolderName: "John Doe",
    accountType: "current",
    isDefault: false,
  },
]

const mockWithdrawals: WithdrawalRecord[] = [
  {
    id: "WD001",
    amount: 25000,
    bankAccount: mockBankAccounts[0],
    status: "completed",
    requestDate: "2024-01-15",
    requestTime: "14:30:25",
    processedDate: "2024-01-15",
    processedTime: "16:45:12",
    reference: "WD-2024-001",
    charges: 0,
  },
  {
    id: "WD002",
    amount: 15000,
    bankAccount: mockBankAccounts[1],
    status: "processing",
    requestDate: "2024-01-14",
    requestTime: "10:15:42",
    reference: "WD-2024-002",
    charges: 0,
  },
  {
    id: "WD003",
    amount: 50000,
    bankAccount: mockBankAccounts[0],
    status: "pending",
    requestDate: "2024-01-13",
    requestTime: "16:20:18",
    reference: "WD-2024-003",
    charges: 0,
  },
]

export function WithdrawalsSection() {
  const { toast } = useToast()

  // Get console data
  const { data: session } = useSession()
  const userId = (session?.user as any)?.id as string | undefined
  const { consoleData, isLoading, error, createWithdrawalRequest } = useConsoleData(userId)

  const withdrawals = consoleData?.withdrawals || []
  const withdrawalRecords = withdrawals.map(mapConsoleWithdrawalToRecord)
  const bankAccounts = consoleData?.bankAccounts || []

  const handleWithdrawalRequest = async (amount: number, bankAccountId: string) => {
    const result = await createWithdrawalRequest({
      amount,
      bankAccountId,
      reference: `WD-${Date.now()}`,
      charges: 0
    })

    if (result.success) {
      toast({
        title: "Withdrawal Request Created",
        description: "Your withdrawal request has been submitted successfully.",
      })
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive",
      })
    }
  }

  const totalWithdrawn = withdrawals
    .filter((w) => String(w.status).toUpperCase() === "COMPLETED")
    .reduce((sum, w) => sum + normalizeConsoleNonNegativeNumber(w.amount), 0)
  const pendingWithdrawals = withdrawals.filter((w) => {
    const normalizedStatus = String(w.status).toUpperCase()
    return normalizedStatus === "PENDING" || normalizedStatus === "PROCESSING"
  }).length
  const hasPendingRequest = pendingWithdrawals > 0
  const availableBalance = consoleData?.tradingAccount?.availableMargin ?? consoleData?.tradingAccount?.balance ?? 0

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading withdrawals data...
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-xl font-semibold text-destructive">Error loading withdrawals</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 lg:space-y-8"
    >
      {/* Header - Mobile Optimized */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Withdrawals</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Withdraw funds from your trading account</p>
      </div>

      {/* Summary Cards - Mobile Optimized */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="text-xl font-semibold text-green-600">₹{availableBalance.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                <ArrowUpFromLine className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Withdrawn</p>
                <p className="text-xl font-semibold text-blue-600">₹{totalWithdrawn.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-950 rounded-lg">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Requests</p>
                <p className="text-xl font-semibold text-orange-600">{pendingWithdrawals}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-950 rounded-lg">
                <Building2 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Linked Banks</p>
                <p className="text-xl font-semibold text-purple-600">{bankAccounts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content - Mobile Optimized */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Withdrawal Request Form */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpFromLine className="w-5 h-5" />
                Request Withdrawal
              </CardTitle>
              <CardDescription>Withdraw funds to your linked bank account</CardDescription>
            </CardHeader>
            <CardContent>
              <WithdrawalRequestForm
                bankAccounts={bankAccounts}
                availableBalance={availableBalance}
                onSubmit={handleWithdrawalRequest}
                hasPendingRequest={hasPendingRequest}
              />
            </CardContent>
          </Card>
        </div>

        {/* Withdrawals List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Withdrawal History</CardTitle>
              <CardDescription>Track your withdrawal requests and their status</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <WithdrawalsList withdrawals={withdrawalRecords} />
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}
