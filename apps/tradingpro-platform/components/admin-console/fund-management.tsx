/**
 * @file fund-management.tsx
 * @module admin-console
 * @description Fund management dashboard for deposits and withdrawals
 * @author StockTrade
 * @created 2026-01-15
 * @updated 2026-04-01
 *
 * Notes:
 * - Payout drawer supports RBAC-masked vs full bank fields; sensitive access is audit-logged.
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Plus, Check, X, TrendingUp, TrendingDown, AlertCircle, Wallet, RefreshCw, Activity, Info, Copy } from "lucide-react"
import { AddFundsDialog } from "./add-funds-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "@/hooks/use-toast"
import { StatusBadge, PageHeader, RefreshButton, FilterBar, type FilterField } from "./shared"
import { deriveDataSourceStatus, type DataSourceStatus } from "@/lib/admin/data-source"
import { normalizeAdminFundAmount } from "@/components/admin-console/fund-number-utils"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"
import {
  formatAdminBankAccountSummary,
  formatAdminBeneficiaryMask,
  formatAdminFullAccountForDisplay,
  formatAdminMaskedIfsc,
  normalizeAdminAccountNumber,
} from "@/lib/admin/admin-bank-display"

// Sample data for manual demos
const mockFundRequests = [
  {
    id: "1",
    userId: "USR_001234",
    userClientId: "CLI001234",
    userName: "Alex Chen",
    amount: 5000,
    method: "Bank Transfer",
    utrCode: "UTR123456789",
    screenshot: "/placeholder.svg",
    status: "PENDING",
    requestDate: "2024-03-15 10:30 AM",
    description: "Initial deposit",
  },
]

const mockWithdrawalRequests = [
  {
    id: "1",
    userId: "USR_004321",
    userClientId: "CLI004321",
    userName: "Emma Wilson",
    amount: 3000,
    method: "Bank Transfer",
    accountDetails: "HDFC Bank - ****1234",
    status: "PENDING",
    requestDate: "2024-03-15 11:00 AM",
    description: "Profit withdrawal",
  },
]

type WithdrawalRowState = {
  id: string
  userId: string
  userName: string
  userClientId: string
  amount: number
  method: string
  accountDetails: string
  status: string
  requestDate: string
  description: string
  tradingAccount?: unknown
  bankAccount?: Record<string, unknown> | null
}

export function FundManagement() {
  const { permissions } = useAdminSession()
  const canRevealSensitiveBank =
    permissions.includes("admin.all") || permissions.includes("admin.users.bank.sensitive")

  const [searchTerm, setSearchTerm] = useState("")
  const [showAddFundsDialog, setShowAddFundsDialog] = useState(false)
  const [payoutDrawerOpen, setPayoutDrawerOpen] = useState(false)
  const [payoutDrawerRow, setPayoutDrawerRow] = useState<WithdrawalRowState | null>(null)
  
  // Dialog states for prompt() replacements
  const [txnIdDialogOpen, setTxnIdDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [txnIdInput, setTxnIdInput] = useState("")
  const [rejectReasonInput, setRejectReasonInput] = useState("")
  const [pendingApprovalRequest, setPendingApprovalRequest] = useState<{ id: string; type: "deposit" | "withdrawal"; amount: number } | null>(null)
  const [pendingRejectRequest, setPendingRejectRequest] = useState<{ id: string; type: "deposit" | "withdrawal"; amount: number } | null>(null)

  // Data states
  const [deposits, setDeposits] = useState<typeof mockFundRequests>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRowState[]>([])
  const [useSampleData, setUseSampleData] = useState(false)
  const [dataSourceStatus, setDataSourceStatus] = useState<DataSourceStatus>("loading")
  const [dataSourceErrors, setDataSourceErrors] = useState<string[]>([])
  const [dataSourceSummary, setDataSourceSummary] = useState<{ okCount: number; total: number } | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const getIstTimestamp = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })

  const logPayoutSensitive = useCallback(
    async (payload: {
      targetUserId: string
      withdrawalId: string
      bankAccountId?: string
      event: "OPEN_PAYOUT_DETAILS" | "COPY_SENSITIVE"
      field?: string
      revealedFullDetails?: boolean
    }) => {
      try {
        await fetch("/api/admin/payout-sensitive-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } catch {
        /* non-blocking audit */
      }
    },
    []
  )

  const openPayoutDrawer = (row: WithdrawalRowState) => {
    setPayoutDrawerRow(row)
    setPayoutDrawerOpen(true)
  }

  const payoutDrawerUserId = payoutDrawerRow?.userId
  const payoutDrawerWithdrawalId = payoutDrawerRow?.id
  const payoutDrawerBankAccountId =
    payoutDrawerRow?.bankAccount && typeof payoutDrawerRow.bankAccount.id === "string"
      ? payoutDrawerRow.bankAccount.id
      : undefined

  useEffect(() => {
    if (!payoutDrawerOpen || !payoutDrawerWithdrawalId || !payoutDrawerUserId || useSampleData) return
    if (!canRevealSensitiveBank) return
    void logPayoutSensitive({
      targetUserId: payoutDrawerUserId,
      withdrawalId: payoutDrawerWithdrawalId,
      bankAccountId: payoutDrawerBankAccountId,
      event: "OPEN_PAYOUT_DETAILS",
      revealedFullDetails: true,
    })
  }, [
    payoutDrawerOpen,
    payoutDrawerWithdrawalId,
    payoutDrawerUserId,
    payoutDrawerBankAccountId,
    useSampleData,
    canRevealSensitiveBank,
    logPayoutSensitive,
  ])

  const getResponseErrorMessage = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => null)
    return data?.error || data?.message || fallback
  }

  const fetchRealData = async () => {
    setLoading(true)
    setDataSourceStatus("loading")

    const depositResult = { name: "Deposits API", ok: false, error: "" }
    const withdrawalResult = { name: "Withdrawals API", ok: false, error: "" }

    try {
      const [depositsResponse, withdrawalsResponse] = await Promise.all([
        fetch("/api/admin/deposits").catch((error) => {
          depositResult.error = error?.message || "Deposits request failed"
          return null
        }),
        fetch("/api/admin/withdrawals").catch((error) => {
          withdrawalResult.error = error?.message || "Withdrawals request failed"
          return null
        }),
      ])

      if (depositsResponse && depositsResponse.ok) {
        const data = await depositsResponse.json()
        if (data.success && data.deposits) {
          const realDeposits = data.deposits.map((d: any) => ({
            id: d.id,
            userId: d.userId,
            userName: d.user?.name || "Unknown",
            userClientId: d.user?.clientId || "",
            amount: normalizeAdminFundAmount(d.amount),
            method: d.method,
            utrCode: d.utr || "N/A",
            status: d.status,
            requestDate: new Date(d.createdAt).toLocaleString(),
            description: d.remarks || "",
            tradingAccount: d.tradingAccount,
            screenshot: d.screenshotUrl || null,
          }))
          setDeposits(realDeposits)
          depositResult.ok = true
        }
      } else if (depositsResponse) {
        depositResult.error = await getResponseErrorMessage(depositsResponse, "Failed to load deposits")
        setDeposits([])
      } else {
        setDeposits([])
      }

      if (withdrawalsResponse && withdrawalsResponse.ok) {
        const data = await withdrawalsResponse.json()
        if (data.success && data.withdrawals) {
          const realWithdrawals: WithdrawalRowState[] = data.withdrawals.map((w: Record<string, unknown>) => {
            const bank = w.bankAccount as Record<string, unknown> | null | undefined
            const accountDetails = bank
              ? formatAdminBankAccountSummary(bank.bankName, bank.accountNumber)
              : "N/A — no linked bank account"
            return {
              id: String(w.id),
              userId: String(w.userId),
              userName: (w.user as { name?: string } | undefined)?.name || "Unknown",
              userClientId: (w.user as { clientId?: string } | undefined)?.clientId || "",
              amount: normalizeAdminFundAmount(w.amount),
              method: "Bank Transfer",
              accountDetails,
              status: String(w.status),
              requestDate: new Date(w.createdAt as string).toLocaleString(),
              description: String(w.remarks || ""),
              tradingAccount: w.tradingAccount,
              bankAccount: bank ?? null,
            }
          })
          setWithdrawals(realWithdrawals)
          withdrawalResult.ok = true
        }
      } else if (withdrawalsResponse) {
        withdrawalResult.error = await getResponseErrorMessage(withdrawalsResponse, "Failed to load withdrawals")
        setWithdrawals([])
      } else {
        setWithdrawals([])
      }

      const summary = deriveDataSourceStatus([depositResult, withdrawalResult])
      setDataSourceStatus(summary.status)
      setDataSourceErrors(summary.errors)
      setDataSourceSummary({ okCount: summary.okCount, total: summary.total })
      setLastUpdatedAt(getIstTimestamp())
    } catch (error: any) {
      console.error("[FUND-MANAGEMENT] Fetch failed", error)
      setDeposits([])
      setWithdrawals([])
      setDataSourceStatus("error")
      setDataSourceErrors([error?.message || "Unable to fetch fund data"])
      setDataSourceSummary({ okCount: 0, total: 2 })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (useSampleData) return

    fetchRealData()
    const interval = setInterval(fetchRealData, 30000)
    return () => clearInterval(interval)
  }, [useSampleData])

  const handleUseSampleData = () => {
    setUseSampleData(true)
    setLoading(false)
    setDeposits(mockFundRequests)
    setWithdrawals(mockWithdrawalRequests as WithdrawalRowState[])
    setDataSourceStatus("sample")
    setDataSourceErrors([])
    setDataSourceSummary({ okCount: 0, total: 2 })
    setLastUpdatedAt(getIstTimestamp())
    toast({ title: "Sample data loaded", description: "Fund management is now showing sample data." })
  }

  const handleUseLiveData = () => {
    setUseSampleData(false)
  }

  const handleApprove = async (request: any, type: 'deposit' | 'withdrawal') => {
    if (useSampleData) {
      toast({
        title: "Live data required",
        description: "Switch to live data to approve requests.",
        variant: "destructive"
      })
      return
    }

    // For withdrawals, open dialog to get transaction ID
    if (type === 'withdrawal') {
      setPendingApprovalRequest({ id: request.id, type, amount: request.amount })
      setTxnIdInput("")
      setTxnIdDialogOpen(true)
      return
    }

    // For deposits, proceed directly
    await executeApproval(type, request.id, undefined)
  }

  const executeApproval = async (type: 'deposit' | 'withdrawal', requestId: string, transactionId?: string) => {
    try {
      const endpoint = type === 'deposit' ? '/api/admin/deposits' : '/api/admin/withdrawals'
      const body: any = {
        [type === 'deposit' ? 'depositId' : 'withdrawalId']: requestId,
        action: 'approve'
      }
      if (transactionId) {
        body.transactionId = transactionId
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to approve ${type}`)
      }

      toast({
        title: "Approved",
        description: `${type === 'deposit' ? 'Deposit' : 'Withdrawal'} of ₹${pendingApprovalRequest?.amount || 0} approved successfully`,
      })

      setTxnIdDialogOpen(false)
      setPendingApprovalRequest(null)
      await fetchData()
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred"
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      })
    }
  }

  const handleReject = async (request: any, type: 'deposit' | 'withdrawal') => {
    if (useSampleData) {
      toast({
        title: "Live data required",
        description: "Switch to live data to reject requests.",
        variant: "destructive"
      })
      return
    }

    // Open dialog to get rejection reason
    setPendingRejectRequest({ id: request.id, type, amount: request.amount })
    setRejectReasonInput("")
    setRejectDialogOpen(true)
  }

  const executeRejection = async (requestId: string, type: 'deposit' | 'withdrawal', reason: string) => {
    try {
      const endpoint = type === 'deposit' ? '/api/admin/deposits' : '/api/admin/withdrawals'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [type === 'deposit' ? 'depositId' : 'withdrawalId']: requestId,
          action: 'reject',
          reason
        })
      })

      const data = await response.json()

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || `Failed to reject ${type}`)
      }

      toast({
        title: "Rejected",
        description: `${type === 'deposit' ? 'Deposit' : 'Withdrawal'} rejected: ${reason}`,
      })

      setRejectDialogOpen(false)
      setPendingRejectRequest(null)
      await fetchData()
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred"
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      })
    }
  }

  const filteredDeposits = deposits.filter(
    (req) =>
      req.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.userClientId && req.userClientId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      req.utrCode.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const filteredWithdrawals = withdrawals.filter((req: WithdrawalRowState) => {
    const q = searchTerm.toLowerCase()
    return (
      req.userName.toLowerCase().includes(q) ||
      (req.userClientId && req.userClientId.toLowerCase().includes(q)) ||
      String(req.accountDetails ?? "").toLowerCase().includes(q)
    )
  })

  const dataBadge = (() => {
    if (dataSourceStatus === "live") return { status: "SUCCESS", label: "Live" }
    if (dataSourceStatus === "partial") {
      const suffix = dataSourceSummary ? ` ${dataSourceSummary.okCount}/${dataSourceSummary.total}` : ""
      return { status: "WARNING", label: `Partial${suffix}` }
    }
    if (dataSourceStatus === "error") return { status: "ERROR", label: "Error" }
    if (dataSourceStatus === "sample") return { status: "INFO", label: "Sample" }
    return { status: "PENDING", label: "Loading" }
  })()

  // Filter fields configuration
  const filterFields: FilterField[] = [
    {
      key: 'search',
      label: 'Search',
      type: 'text',
      placeholder: 'Search by user name, client ID, or UTR...',
      span: 2
    }
  ]

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* Data Source Status */}
      {dataSourceStatus === "error" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <AlertTitle className="text-red-500 text-sm sm:text-base">Live data unavailable</AlertTitle>
          <AlertDescription className="text-red-400 text-xs sm:text-sm space-y-2">
            {dataSourceErrors.length > 0 && (
              <div className="space-y-1">
                {dataSourceErrors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto text-xs sm:text-sm"
                onClick={fetchRealData}
                disabled={loading}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
                Retry
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto text-xs sm:text-sm"
                onClick={handleUseSampleData}
              >
                Use Sample Data
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {dataSourceStatus === "partial" && (
        <Alert className="bg-yellow-500/10 border-yellow-500/50">
          <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
          <AlertTitle className="text-yellow-500 text-sm sm:text-base">Partial data loaded</AlertTitle>
          <AlertDescription className="text-yellow-500/80 text-xs sm:text-sm space-y-2">
            {dataSourceErrors.length > 0 && (
              <div className="space-y-1">
                {dataSourceErrors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto text-xs sm:text-sm"
                onClick={fetchRealData}
                disabled={loading}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
                Retry
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto text-xs sm:text-sm"
                onClick={handleUseSampleData}
              >
                Use Sample Data
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {dataSourceStatus === "sample" && (
        <Alert className="bg-blue-500/10 border-blue-500/50">
          <Activity className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <AlertTitle className="text-blue-500 text-sm sm:text-base">Sample data mode</AlertTitle>
          <AlertDescription className="text-blue-500/80 text-xs sm:text-sm space-y-2">
            <p>Sample data is active. Switch back to live data to run admin actions reliably.</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto text-xs sm:text-sm"
              onClick={handleUseLiveData}
            >
              Use Live Data
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <PageHeader
        title="Fund Management"
        description="Manage deposits, withdrawals, and fund requests"
        icon={<Wallet className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={
          <>
            <StatusBadge status={dataBadge.status} type="general">
              {dataBadge.label}
            </StatusBadge>
            {lastUpdatedAt && <span className="text-xs text-muted-foreground">Updated {lastUpdatedAt}</span>}
            {!useSampleData && (
              <Button variant="outline" size="sm" onClick={handleUseSampleData} className="text-xs sm:text-sm">
                Load Sample
              </Button>
            )}
            <RefreshButton
              onClick={() => (useSampleData ? handleUseLiveData() : fetchRealData())}
              loading={loading}
            />
            <Button
              onClick={() => setShowAddFundsDialog(true)}
              className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm"
              size="sm"
              disabled={useSampleData}
              title={useSampleData ? "Switch to live data to add funds" : "Add funds"}
            >
              <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Add Funds</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </>
        }
      />

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <FilterBar
          filters={{ search: searchTerm }}
          fields={filterFields}
          onFilterChange={(key, value) => {
            if (key === 'search') setSearchTerm(value)
          }}
          onReset={() => setSearchTerm('')}
          showReset={false}
        />
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Tabs defaultValue="deposits" className="space-y-3 sm:space-y-4 md:space-y-6">
          <TabsList className="bg-muted/50 w-full sm:w-auto flex flex-col sm:flex-row">
            <TabsTrigger value="deposits" className="text-xs sm:text-sm w-full sm:w-auto">
              <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Deposit Requests</span>
              <span className="sm:hidden">Deposits</span>
              <span className="ml-1 sm:ml-2">({filteredDeposits.length})</span>
            </TabsTrigger>
            <TabsTrigger value="withdrawals" className="text-xs sm:text-sm w-full sm:w-auto">
              <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Withdrawal Requests</span>
              <span className="sm:hidden">Withdrawals</span>
              <span className="ml-1 sm:ml-2">({filteredWithdrawals.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Deposits Tab */}
          <TabsContent value="deposits">
            <Card className="bg-card border-border shadow-sm neon-border">
              <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-lg sm:text-xl font-bold text-primary">Deposit Requests</CardTitle>
              </CardHeader>
              <CardContent className="px-0 sm:px-6 pb-3 sm:pb-6">
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <div className="min-w-[900px] sm:min-w-0">
                    <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-muted-foreground">User</TableHead>
                        <TableHead className="text-muted-foreground">Amount</TableHead>
                        <TableHead className="text-muted-foreground">Method</TableHead>
                        <TableHead className="text-muted-foreground">UTR/Reference</TableHead>
                        <TableHead className="text-muted-foreground">Proof</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-muted-foreground">Date</TableHead>
                        <TableHead className="text-muted-foreground">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeposits.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No deposit requests found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredDeposits.map((request, index) => (
                          <motion.tr
                            key={request.id}
                            className="border-border hover:bg-muted/30 transition-colors"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                          >
                            <TableCell>
                              <div>
                                <p className="font-medium text-foreground">{request.userName}</p>
                                <p className="text-sm text-muted-foreground">{request.userClientId || request.userId}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="font-bold text-green-400">₹{request.amount.toLocaleString()}</p>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm text-foreground">{request.method}</p>
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-muted px-2 py-1 rounded">{request.utrCode}</code>
                            </TableCell>
                            <TableCell>
                              {request.screenshot ? (
                                <a
                                  href={request.screenshot}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary underline"
                                >
                                  View
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell><StatusBadge status={request.status} /></TableCell>
                            <TableCell>
                              <p className="text-sm text-muted-foreground">{request.requestDate}</p>
                            </TableCell>
                            <TableCell>
                              {request.status === 'PENDING' ? (
                                <div className="flex items-center space-x-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleApprove(request, 'deposit')}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                  >
                                    <Check className="w-4 h-4 mr-1" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleReject(request, 'deposit')}
                                  >
                                    <X className="w-4 h-4 mr-1" />
                                    Reject
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </motion.tr>
                        ))
                      )}
                    </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Withdrawals Tab */}
          <TabsContent value="withdrawals">
            <Card className="bg-card border-border shadow-sm neon-border">
              <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-lg sm:text-xl font-bold text-primary">Withdrawal Requests</CardTitle>
              </CardHeader>
              <CardContent className="px-0 sm:px-6 pb-3 sm:pb-6">
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <div className="min-w-[900px] sm:min-w-0">
                    <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-muted-foreground">User</TableHead>
                        <TableHead className="text-muted-foreground">Amount</TableHead>
                        <TableHead className="text-muted-foreground">Bank Account</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-muted-foreground">Date</TableHead>
                        <TableHead className="text-muted-foreground">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWithdrawals.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No withdrawal requests found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredWithdrawals.map((request, index) => (
                          <motion.tr
                            key={request.id}
                            className="border-border hover:bg-muted/30 transition-colors"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                          >
                            <TableCell>
                              <div>
                                <p className="font-medium text-foreground">{request.userName}</p>
                                <p className="text-sm text-muted-foreground">{request.userClientId || request.userId}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="font-bold text-red-400">₹{request.amount.toLocaleString()}</p>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                                <p className="text-sm text-foreground flex-1 min-w-0">{request.accountDetails}</p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 shrink-0 text-xs"
                                  onClick={() => openPayoutDrawer(request)}
                                >
                                  <Info className="w-3 h-3 mr-1" />
                                  Payout
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell><StatusBadge status={request.status} /></TableCell>
                            <TableCell>
                              <p className="text-sm text-muted-foreground">{request.requestDate}</p>
                            </TableCell>
                            <TableCell>
                              {request.status === 'PENDING' ? (
                                <div className="flex items-center space-x-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleApprove(request, 'withdrawal')}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                  >
                                    <Check className="w-4 h-4 mr-1" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleReject(request, 'withdrawal')}
                                  >
                                    <X className="w-4 h-4 mr-1" />
                                    Reject
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </motion.tr>
                        ))
                      )}
                    </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Dialogs */}
      <AddFundsDialog open={showAddFundsDialog} onOpenChange={setShowAddFundsDialog} />

      {/* Transaction ID Dialog for withdrawal approval */}
      <Dialog open={txnIdDialogOpen} onOpenChange={setTxnIdDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Transaction Reference</DialogTitle>
            <DialogDescription>
              Enter the UTR/transaction ID to approve this withdrawal of ₹{pendingApprovalRequest?.amount || 0}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="txn-id">UTR / Transaction ID</Label>
              <Input
                id="txn-id"
                placeholder="e.g., SBIN123456789012"
                value={txnIdInput}
                onChange={(e) => setTxnIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && txnIdInput.trim()) {
                    executeApproval(pendingApprovalRequest!.type, pendingApprovalRequest!.id, txnIdInput.trim())
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxnIdDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (pendingApprovalRequest && txnIdInput.trim()) {
                  executeApproval(pendingApprovalRequest.type, pendingApprovalRequest.id, txnIdInput.trim())
                }
              }}
              disabled={!txnIdInput.trim()}
            >
              Approve Withdrawal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              Enter the reason for rejecting this {pendingRejectRequest?.type || "request"} of ₹{pendingRejectRequest?.amount || 0}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Rejection Reason</Label>
              <Input
                id="reject-reason"
                placeholder="e.g., Invalid account details"
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && rejectReasonInput.trim()) {
                    if (pendingRejectRequest) {
                      executeRejection(pendingRejectRequest.id, pendingRejectRequest.type, rejectReasonInput.trim())
                    }
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingRejectRequest && rejectReasonInput.trim()) {
                  executeRejection(pendingRejectRequest.id, pendingRejectRequest.type, rejectReasonInput.trim())
                }
              }}
              disabled={!rejectReasonInput.trim()}
            >
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Drawer
        open={payoutDrawerOpen}
        onOpenChange={(open) => {
          setPayoutDrawerOpen(open)
          if (!open) setPayoutDrawerRow(null)
        }}
      >
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>Payout beneficiary</DrawerTitle>
            <DrawerDescription>
              Withdrawal {payoutDrawerRow?.id ?? "—"} · {payoutDrawerRow?.userName ?? "User"}
            </DrawerDescription>
          </DrawerHeader>
          {payoutDrawerRow && (
            <div className="px-4 pb-2 space-y-3 text-sm overflow-y-auto">
              {!payoutDrawerRow.bankAccount && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No bank link</AlertTitle>
                  <AlertDescription>
                    This withdrawal has no linked BankAccount in the API response. Check data integrity or sync.
                  </AlertDescription>
                </Alert>
              )}
              {payoutDrawerRow.bankAccount && (
                <>
                  <div className="grid gap-1">
                    <span className="text-muted-foreground text-xs">Bank</span>
                    <span className="font-medium">
                      {String(payoutDrawerRow.bankAccount.bankName ?? "—")}
                    </span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-muted-foreground text-xs">Account number</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono break-all">
                        {canRevealSensitiveBank
                          ? formatAdminFullAccountForDisplay(payoutDrawerRow.bankAccount.accountNumber)
                          : formatAdminBankAccountSummary(
                              payoutDrawerRow.bankAccount.bankName,
                              payoutDrawerRow.bankAccount.accountNumber
                            )}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={async () => {
                          const raw = normalizeAdminAccountNumber(payoutDrawerRow.bankAccount?.accountNumber)
                          const display = canRevealSensitiveBank
                            ? raw || "—"
                            : raw
                              ? `****${raw.slice(-4)}`
                              : "—"
                          if (canRevealSensitiveBank && raw) {
                            await logPayoutSensitive({
                              targetUserId: payoutDrawerRow.userId,
                              withdrawalId: payoutDrawerRow.id,
                              bankAccountId:
                                typeof payoutDrawerRow.bankAccount?.id === "string"
                                  ? payoutDrawerRow.bankAccount.id
                                  : undefined,
                              event: "COPY_SENSITIVE",
                              field: "accountNumber",
                            })
                          }
                          try {
                            await navigator.clipboard.writeText(display)
                            toast({ title: "Copied", description: "Account value copied" })
                          } catch {
                            toast({ title: "Copy failed", variant: "destructive" })
                          }
                        }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-muted-foreground text-xs">IFSC</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">
                        {canRevealSensitiveBank
                          ? String(payoutDrawerRow.bankAccount.ifscCode ?? "—").toUpperCase()
                          : formatAdminMaskedIfsc(payoutDrawerRow.bankAccount.ifscCode)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={async () => {
                          const full = String(payoutDrawerRow.bankAccount?.ifscCode ?? "").trim()
                          const display = canRevealSensitiveBank
                            ? full.toUpperCase() || "—"
                            : formatAdminMaskedIfsc(full)
                          if (canRevealSensitiveBank && full) {
                            await logPayoutSensitive({
                              targetUserId: payoutDrawerRow.userId,
                              withdrawalId: payoutDrawerRow.id,
                              bankAccountId:
                                typeof payoutDrawerRow.bankAccount?.id === "string"
                                  ? payoutDrawerRow.bankAccount.id
                                  : undefined,
                              event: "COPY_SENSITIVE",
                              field: "ifscCode",
                            })
                          }
                          try {
                            await navigator.clipboard.writeText(display)
                            toast({ title: "Copied", description: "IFSC copied" })
                          } catch {
                            toast({ title: "Copy failed", variant: "destructive" })
                          }
                        }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-muted-foreground text-xs">Account holder</span>
                    <span>{String(payoutDrawerRow.bankAccount.accountHolderName ?? "—")}</span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-muted-foreground text-xs">Beneficiary summary (masked)</span>
                    <span className="text-xs text-muted-foreground break-words">
                      {formatAdminBeneficiaryMask(
                        payoutDrawerRow.bankAccount as Parameters<typeof formatAdminBeneficiaryMask>[0]
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>Bank account ID: {String(payoutDrawerRow.bankAccount.id ?? "—")}</span>
                    <span>User ID: {payoutDrawerRow.userId}</span>
                  </div>
                  {!canRevealSensitiveBank && (
                    <p className="text-xs text-amber-600">
                      Full account number and IFSC require <code className="text-xs">admin.users.bank.sensitive</code>{" "}
                      or <code className="text-xs">admin.all</code> (assign via Access Control when needed).
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          <DrawerFooter>
            <DrawerClose asChild>
              <Button type="button" variant="outline" className="w-full">
                Close
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}