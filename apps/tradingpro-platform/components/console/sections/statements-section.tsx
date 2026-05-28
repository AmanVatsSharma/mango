"use client"

/**
 * @file statements-section.tsx
 * @module components/console/sections
 * @description Statements workspace: full-range ledger via /api/console/statement (no 100-row cap), filters, export.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-01
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { FileText, Download, ChevronDown } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { StatementsTable } from "../statements/statements-table"
import { FilterBar } from "../statements/filter-bar"
import { ExportDialog } from "../statements/export-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSession } from "next-auth/react"
import { formatDateIST, formatTimeIST } from "@/lib/date-utils"
import { normalizeConsoleNumber, normalizeConsoleTimestamp } from "@/components/console/console-number-utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"

export interface Transaction {
  id: string
  date: string
  time: string
  timestamp?: string
  type: "credit" | "debit"
  amount: number
  description: string
  balance: number
  category: "trading" | "deposit" | "withdrawal" | "brokerage" | "charges" | "margin" | "reversal"
  cashAmount?: number
  kind?: string
}

type StatementRowJson = {
  id: string
  dateIso: string
  type: string
  description: string
  amount: number
  cashAmount?: number
  balance?: number
  marginOnly?: boolean
  kind?: string
  status?: string
}

type ConsoleStatementResponse = {
  success?: boolean
  error?: string
  manifest?: {
    range: { startIso: string; endIso: string }
    sums: { ledgerCredits: number; ledgerDebits: number; chargesLikelyDebits: number }
    counts: { ledger: number; executedOrders: number; deposits: number; withdrawals: number }
  }
  transactions?: Array<{
    id: string
    type: string
    amount: unknown
    description: string | null
    createdAt: string | Date
  }>
  statementRows?: StatementRowJson[]
  statementEvents?: Array<{
    id: string
    kind: string
    dateIso: string
    primary: StatementRowJson
    children: StatementRowJson[]
  }>
  statementFunds?: {
    opening: { balance: number; availableMargin: number | null; usedMargin: number | null }
    closing: { balance: number; availableMargin: number; usedMargin: number }
    cashStreamTotals: { netCashInWindow: number }
  } | null
  statementWarnings?: string[]
}

function statementKindToCategory(
  kind: string | undefined,
  rowType: string,
): Transaction["category"] {
  if (rowType === "deposit") return "deposit"
  if (rowType === "withdrawal") return "withdrawal"
  if (rowType === "trade") return "trading"
  switch (kind) {
    case "fee":
      return "charges"
    case "margin":
      return "margin"
    case "reversal":
      return "reversal"
    case "pnl":
      return "trading"
    case "adjustment":
      return "brokerage"
    case "funds":
      return "deposit"
    default:
      return "trading"
  }
}

const RANGE_MS = 90 * 24 * 60 * 60 * 1000

export function StatementsSection() {
  const { data: session } = useSession()
  const userId = (session?.user as { id?: string })?.id

  const [payload, setPayload] = useState<ConsoleStatementResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [rangeEnd] = useState(() => new Date())
  const rangeStart = useMemo(() => new Date(rangeEnd.getTime() - RANGE_MS), [rangeEnd])

  const loadStatement = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const from = rangeStart.toISOString()
      const to = rangeEnd.toISOString()
      const res = await fetch(`/api/console/statement?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        cache: "no-store",
      })
      const data = (await res.json().catch(() => ({}))) as ConsoleStatementResponse
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to load statement (${res.status})`)
      }
      setPayload(data)
    } catch (e: unknown) {
      setPayload(null)
      setError(e instanceof Error ? e.message : "Failed to load statement")
    } finally {
      setLoading(false)
    }
  }, [userId, rangeStart, rangeEnd])

  useEffect(() => {
    void loadStatement()
  }, [loadStatement])

  const mapped: Transaction[] = useMemo(() => {
    try {
      const rich = payload?.statementRows
      if (rich?.length) {
        return rich.map((r) => {
          const isCredit = r.amount >= 0
          return {
            id: r.id,
            date: formatDateIST(r.dateIso),
            time: formatTimeIST(r.dateIso),
            timestamp: normalizeConsoleTimestamp(r.dateIso)?.toISOString(),
            type: isCredit ? ("credit" as const) : ("debit" as const),
            amount: Math.abs(normalizeConsoleNumber(r.amount)),
            description: r.description || "",
            balance: normalizeConsoleNumber(r.balance ?? 0),
            category: statementKindToCategory(r.kind, r.type),
            cashAmount: r.cashAmount !== undefined ? normalizeConsoleNumber(r.cashAmount) : undefined,
            kind: r.kind,
          }
        })
      }
      const ledger = payload?.transactions || []
      return ledger.map((t) => {
        const parsedTimestamp = normalizeConsoleTimestamp(t.createdAt)
        const isCredit = (t.type || "CREDIT").toUpperCase() === "CREDIT"
        const raw = normalizeConsoleNumber(t.amount)
        return {
          id: t.id,
          date: formatDateIST(t.createdAt),
          time: formatTimeIST(t.createdAt),
          timestamp: parsedTimestamp?.toISOString(),
          type: isCredit ? "credit" : "debit",
          amount: Math.abs(raw),
          description: t.description || "",
          balance: 0,
          category: "trading" as Transaction["category"],
        }
      })
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("StatementsSection: failed to map transactions", e)
      }
      return []
    }
  }, [payload])

  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([])
  useEffect(() => setFilteredTransactions(mapped), [mapped])
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [mainTab, setMainTab] = useState<"overview" | "ledger">("overview")

  const manifest = payload?.manifest
  const totalCreditsUi = manifest?.sums.ledgerCredits
  const totalDebitsUi = manifest?.sums.ledgerDebits

  if (!userId) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">Sign in to view statements.</div>
    )
  }

  if (loading && !payload) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">Loading statements data...</div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-xl font-semibold text-destructive">Error loading statements</div>
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
      <div className="space-y-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Statements</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Statements for the last 90 days ({formatDateIST(rangeStart.toISOString())} –{" "}
            {formatDateIST(rangeEnd.toISOString())}). Running balance reflects <strong>cash</strong> only (margin
            mechanics excluded from the balance column).
          </p>
        </div>
        <Button
          onClick={() => setShowExportDialog(true)}
          className="gap-2 w-full sm:w-auto touch-manipulation"
        >
          <Download className="w-4 h-4" />
          <span>Export</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Ledger lines</p>
                <p className="text-xl font-semibold">{manifest?.counts?.ledger ?? mapped.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-green-100 dark:bg-green-950 rounded flex items-center justify-center">
                <div className="w-2 h-2 bg-green-600 rounded-full" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total credits</p>
                <p className="text-xl font-semibold text-green-600">
                  ₹
                  {(totalCreditsUi !== undefined
                    ? totalCreditsUi
                    : filteredTransactions.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0)
                  ).toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-red-100 dark:bg-red-950 rounded flex items-center justify-center">
                <div className="w-2 h-2 bg-red-600 rounded-full" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total debits</p>
                <p className="text-xl font-semibold text-red-600">
                  ₹
                  {(totalDebitsUi !== undefined
                    ? totalDebitsUi
                    : filteredTransactions.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0)
                  ).toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-blue-100 dark:bg-blue-950 rounded flex items-center justify-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net (credits − debits)</p>
                <p className="text-xl font-semibold text-blue-600">
                  ₹
                  {(
                    (totalCreditsUi !== undefined && totalDebitsUi !== undefined
                      ? totalCreditsUi - totalDebitsUi
                      : filteredTransactions.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0) -
                        filteredTransactions.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0)) as number
                  ).toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {payload?.statementWarnings && payload.statementWarnings.length > 0 && (
        <Alert>
          <AlertTitle className="text-sm">Notices</AlertTitle>
          <AlertDescription asChild>
            <ul className="text-xs list-disc pl-4 mt-1 space-y-0.5 text-muted-foreground">
              {payload.statementWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {payload?.statementFunds && (
        <p className="text-xs text-muted-foreground">
          Opening cash (derived for window): ₹
          {payload.statementFunds.opening.balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })} · Net cash in
          view: ₹
          {payload.statementFunds.cashStreamTotals.netCashInWindow.toLocaleString("en-IN", {
            maximumFractionDigits: 2,
          })}{" "}
          · Closing: ₹
          {payload.statementFunds.closing.balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (margin
          snapshot end-of-period).
        </p>
      )}

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "overview" | "ledger")} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Grouped activity (same as admin). Expand a group to see margin, fees, and P&amp;L lines.
          </p>
          {(payload?.statementEvents ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No grouped events (load statement again).</p>
          )}
          {(payload?.statementEvents ?? []).map((evt) => (
            <Collapsible key={evt.id} className="rounded-lg border border-border bg-card">
              <CollapsibleTrigger className="flex w-full items-start gap-2 p-3 text-left hover:bg-muted/40 rounded-t-lg">
                <ChevronDown className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground [[data-state=open]_&]:rotate-180 transition-transform" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {evt.kind}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateIST(evt.dateIso)} · {formatTimeIST(evt.dateIso)}
                    </span>
                  </div>
                  <p className="text-sm font-medium wrap-break-word">{evt.primary.description}</p>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border px-3 pb-3 space-y-2">
                  {[evt.primary, ...evt.children].map((row) => (
                    <div key={row.id} className="text-xs pl-4 border-l-2 border-muted py-1 space-y-0.5">
                      <span className="text-muted-foreground">
                        {formatDateIST(row.dateIso)} {formatTimeIST(row.dateIso)}
                      </span>
                      <p className="text-foreground">{row.description}</p>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </TabsContent>
        <TabsContent value="ledger" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-0">
              <FilterBar
                transactions={mapped}
                onFilterChange={setFilteredTransactions}
                totalTransactions={mapped.length}
                filteredCount={filteredTransactions.length}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Cash ledger</CardTitle>
              <CardDescription>
                Export still includes full trade register and funds CSV. Balance column is cash-only.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <StatementsTable transactions={filteredTransactions} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        transactions={filteredTransactions}
        statementRange={{ fromIso: rangeStart.toISOString(), toIso: rangeEnd.toISOString() }}
      />
    </motion.div>
  )
}
