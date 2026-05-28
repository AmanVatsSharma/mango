"use client"

/**
 * @file deposits-section.tsx
 * @module components/console/sections
 * @description Deposits workspace: admin-driven methods, modals per channel, and deposit history.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-01 — Deposit result toasts with fallback copy; banner when trading wallet id missing.
 */

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowDownToLine, CreditCard, Building2, Smartphone } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DepositForm } from "../deposits/deposit-form"
import { DepositHistory } from "../deposits/deposit-history"
import { UPIPaymentModal } from "../deposits/upi-payment-modal"
import { BankDepositModal } from "../deposits/bank-deposit-modal"
import { CashDepositModal } from "../deposits/cash-deposit-modal"
import { CryptoDepositModal } from "../deposits/crypto-deposit-modal"
import { IntlWireDepositModal } from "../deposits/intl-wire-deposit-modal"
import { ChequeDepositModal } from "../deposits/cheque-deposit-modal"
import { ExternalPayDepositModal } from "../deposits/external-pay-deposit-modal"
import { useSession } from "next-auth/react"
import { useConsoleData } from "@/lib/hooks/use-console-data"
import { useToast } from "@/hooks/use-toast"
import {
  normalizeConsoleNonNegativeNumber,
  normalizeConsoleTimestamp,
} from "@/components/console/console-number-utils"
import type { DepositRecord } from "../deposits/deposit-types"
import type { PublicPaymentDepositMethodId } from "@/lib/payment-deposit-public"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export type { DepositRecord } from "../deposits/deposit-types"

const DEPOSIT_ERROR_FALLBACK =
  "Request failed. Please try again or contact support."

function depositErrorDescription(message: unknown): string {
  if (typeof message === "string" && message.trim()) return message.trim()
  return DEPOSIT_ERROR_FALLBACK
}

export function DepositsSection() {
  const [showUPIModal, setShowUPIModal] = useState(false)
  const [showBankModal, setShowBankModal] = useState(false)
  const [showCashModal, setShowCashModal] = useState(false)
  const [showCryptoModal, setShowCryptoModal] = useState(false)
  const [showWireModal, setShowWireModal] = useState(false)
  const [showChequeModal, setShowChequeModal] = useState(false)
  const [showExternalModal, setShowExternalModal] = useState(false)
  const [depositAmount, setDepositAmount] = useState<number>(0)
  const { toast } = useToast()

  const { data: session } = useSession()
  const userId = (session?.user as { id?: string })?.id
  const {
    consoleData,
    isLoading,
    error,
    createDepositRequest,
    paymentSettings,
    paymentSettingsError,
    paymentSettingsLoading,
    refetchPaymentSettings,
  } = useConsoleData(userId)

  const deposits = consoleData?.deposits || []
  const bankAccounts = consoleData?.bankAccounts || []

  const showDepositResultToast = (
    result: { success: boolean; message?: string },
    successDescription: string
  ) => {
    if (result.success) {
      toast({
        title: "Deposit Request Created",
        description: successDescription,
      })
    } else {
      toast({
        title: "Deposit failed",
        description: depositErrorDescription(result.message),
        variant: "destructive",
      })
    }
  }

  const closeAllModals = () => {
    setShowUPIModal(false)
    setShowBankModal(false)
    setShowCashModal(false)
    setShowCryptoModal(false)
    setShowWireModal(false)
    setShowChequeModal(false)
    setShowExternalModal(false)
  }

  const handleDepositSubmit = async (amount: number, method: PublicPaymentDepositMethodId) => {
    setDepositAmount(amount)
    await refetchPaymentSettings()

    if (method === "upi") {
      setShowUPIModal(true)
      return
    }
    if (method === "bank") {
      setShowBankModal(true)
      return
    }
    if (method === "cash") {
      setShowCashModal(true)
      return
    }
    if (method === "crypto") {
      setShowCryptoModal(true)
      return
    }
    if (method === "wire_intl") {
      setShowWireModal(true)
      return
    }
    if (method === "cheque") {
      setShowChequeModal(true)
      return
    }
    if (method === "external_pay") {
      setShowExternalModal(true)
      return
    }
  }

  const handleUPISuccess = async (data: {
    utr?: string
    screenshotUrl?: string
    screenshotKey?: string
    selectedUpiItemId?: string
  }) => {
    const result = await createDepositRequest({
      amount: depositAmount,
      method: "upi",
      bankAccountId: bankAccounts.find((ba) => ba.isDefault)?.id,
      utr: data.utr,
      reference: `UPI-DEP-${Date.now()}`,
      screenshotUrl: data.screenshotUrl,
      screenshotKey: data.screenshotKey,
      selectedUpiItemId: data.selectedUpiItemId,
    })

    showDepositResultToast(
      result,
      "Your UPI deposit request has been submitted successfully."
    )

    closeAllModals()
  }

  const userDefaultBankId = bankAccounts.find((ba) => ba.isDefault)?.id

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 lg:space-y-8"
    >
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Deposits</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Add funds to your trading account</p>
      </div>

      {!isLoading && !error && consoleData?.tradingAccount?.id === "" ? (
        <Alert>
          <AlertTitle>Trading wallet setup</AlertTitle>
          <AlertDescription>
            No trading wallet was linked to your profile yet. You can still submit a deposit—the system will create
            your wallet automatically. If this message remains after a successful deposit, refresh the page or contact
            support.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
                <ArrowDownToLine className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Deposited</p>
                <p className="text-xl font-semibold text-green-600">
                  ₹
                  {deposits
                    .filter((d) => String(d.status).toUpperCase() === "COMPLETED")
                    .reduce((sum, d) => sum + normalizeConsoleNonNegativeNumber(d.amount), 0)
                    .toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-950 rounded-lg">
                <CreditCard className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Deposits</p>
                <p className="text-xl font-semibold text-orange-600">
                  {
                    deposits.filter((d) => {
                      const s = String(d.status).toUpperCase()
                      return s === "PENDING" || s === "PROCESSING"
                    }).length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-xl font-semibold text-blue-600">
                  ₹
                  {deposits
                    .filter((d) => {
                      const raw =
                        (d as { createdAt?: string; date?: string }).createdAt ??
                        (d as { date?: string }).date
                      if (typeof raw !== "string") return false
                      const parsedDate = normalizeConsoleTimestamp(raw)
                      if (!parsedDate) return false
                      const now = new Date()
                      return (
                        parsedDate.getMonth() === now.getMonth() &&
                        parsedDate.getFullYear() === now.getFullYear()
                      )
                    })
                    .reduce((sum, d) => sum + normalizeConsoleNonNegativeNumber(d.amount), 0)
                    .toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">Loading deposits data...</div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center space-y-2">
            <div className="text-xl font-semibold text-destructive">Error loading deposits</div>
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  Add Funds
                </CardTitle>
                <CardDescription>Choose your preferred deposit method</CardDescription>
              </CardHeader>
              <CardContent>
                <DepositForm
                  paymentSettings={paymentSettings}
                  paymentSettingsError={paymentSettingsError}
                  paymentSettingsLoading={paymentSettingsLoading}
                  onRetryPaymentSettings={refetchPaymentSettings}
                  onSubmit={handleDepositSubmit}
                />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Deposit History</CardTitle>
                <CardDescription>Track your recent deposit transactions</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <DepositHistory deposits={deposits} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <UPIPaymentModal
        open={showUPIModal}
        onOpenChange={(o) => setShowUPIModal(o)}
        amount={depositAmount}
        onSuccess={handleUPISuccess}
        upiOptions={paymentSettings?.methods.upi?.items}
      />

      <BankDepositModal
        open={showBankModal}
        onOpenChange={(o) => setShowBankModal(o)}
        amount={depositAmount}
        bank={paymentSettings?.methods.bank}
        onSuccess={async (data) => {
          const result = await createDepositRequest({
            amount: depositAmount,
            method: "bank",
            bankAccountId: userDefaultBankId,
            reference: data.reference || `BANK-DEP-${Date.now()}`,
            utr: data.reference,
            screenshotUrl: data.screenshotUrl,
            screenshotKey: data.screenshotKey,
            selectedCompanyBankAccountId: data.selectedCompanyBankAccountId,
          })
          showDepositResultToast(result, "Submitted for processing.")
          closeAllModals()
        }}
      />

      <CashDepositModal
        open={showCashModal}
        onOpenChange={(o) => setShowCashModal(o)}
        amount={depositAmount}
        cash={paymentSettings?.methods.cash}
        onSuccess={async (data) => {
          const result = await createDepositRequest({
            amount: depositAmount,
            method: "cash",
            bankAccountId: userDefaultBankId,
            reference: data.reference || `CASH-DEP-${Date.now()}`,
            screenshotUrl: data.screenshotUrl,
            screenshotKey: data.screenshotKey,
          })
          showDepositResultToast(result, "Submitted for processing.")
          closeAllModals()
        }}
      />

      <CryptoDepositModal
        open={showCryptoModal}
        onOpenChange={(o) => setShowCryptoModal(o)}
        amount={depositAmount}
        crypto={paymentSettings?.methods.crypto}
        onSuccess={async (data) => {
          const result = await createDepositRequest({
            amount: depositAmount,
            method: "crypto",
            bankAccountId: userDefaultBankId,
            reference: `CRYPTO-DEP-${Date.now()}`,
            utr: data.cryptoTxHash,
            screenshotUrl: data.screenshotUrl,
            screenshotKey: data.screenshotKey,
            cryptoNetwork: data.cryptoNetwork,
            cryptoTxHash: data.cryptoTxHash,
            cryptoAsset: data.cryptoAsset,
            selectedCryptoWalletId: data.selectedCryptoWalletId,
          })
          showDepositResultToast(result, "Submitted for processing.")
          closeAllModals()
        }}
      />

      <IntlWireDepositModal
        open={showWireModal}
        onOpenChange={(o) => setShowWireModal(o)}
        amount={depositAmount}
        wire={paymentSettings?.methods.wire_intl}
        onSuccess={async (data) => {
          const result = await createDepositRequest({
            amount: depositAmount,
            method: "wire_intl",
            bankAccountId: userDefaultBankId,
            reference: data.reference || `WIRE-DEP-${Date.now()}`,
            screenshotUrl: data.screenshotUrl,
            screenshotKey: data.screenshotKey,
            selectedCompanyBankAccountId: data.selectedCompanyBankAccountId,
          })
          showDepositResultToast(result, "Submitted for processing.")
          closeAllModals()
        }}
      />

      <ChequeDepositModal
        open={showChequeModal}
        onOpenChange={(o) => setShowChequeModal(o)}
        amount={depositAmount}
        cheque={paymentSettings?.methods.cheque}
        onSuccess={async (data) => {
          const result = await createDepositRequest({
            amount: depositAmount,
            method: "cheque",
            bankAccountId: userDefaultBankId,
            reference: data.reference || `CHQ-DEP-${Date.now()}`,
            screenshotUrl: data.screenshotUrl,
            screenshotKey: data.screenshotKey,
          })
          showDepositResultToast(result, "Submitted for processing.")
          closeAllModals()
        }}
      />

      <ExternalPayDepositModal
        open={showExternalModal}
        onOpenChange={(o) => setShowExternalModal(o)}
        amount={depositAmount}
        externalPay={paymentSettings?.methods.external_pay}
        onSuccess={async (data) => {
          const result = await createDepositRequest({
            amount: depositAmount,
            method: "external_pay",
            bankAccountId: userDefaultBankId,
            reference: data.reference || `EXT-DEP-${Date.now()}`,
            utr: data.reference,
            screenshotUrl: data.screenshotUrl,
            screenshotKey: data.screenshotKey,
          })
          showDepositResultToast(result, "Submitted for processing.")
          closeAllModals()
        }}
      />
    </motion.div>
  )
}
