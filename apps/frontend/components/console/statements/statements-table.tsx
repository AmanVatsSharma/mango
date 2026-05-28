"use client"

/**
 * @file statements-table.tsx
 * @module components/console/statements
 * @description Sortable statements table with wrapped descriptions, mobile cards, and detail dialog with copy.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-01
 *
 * Notes:
 * - Desktop: multi-line description cells; mobile: stacked cards for scanability.
 */

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowUpDown, ArrowUp, ArrowDown, MoreHorizontal, Copy, Check } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { Transaction } from "./statements-section"
import { useToast } from "@/hooks/use-toast"

interface StatementsTableProps {
  transactions: Transaction[]
}

type SortField = "date" | "amount" | "balance"
type SortDirection = "asc" | "desc"

export function StatementsTable({ transactions }: StatementsTableProps) {
  const { toast } = useToast()
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [detailTransaction, setDetailTransaction] = useState<Transaction | null>(null)
  const [copiedField, setCopiedField] = useState<"id" | "description" | null>(null)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const sortedTransactions = [...transactions].sort((a, b) => {
    let aValue: number | Date
    let bValue: number | Date

    switch (sortField) {
      case "date":
        aValue = a.timestamp ? new Date(a.timestamp) : new Date(`${a.date} ${a.time}`)
        bValue = b.timestamp ? new Date(b.timestamp) : new Date(`${b.date} ${b.time}`)
        break
      case "amount":
        aValue = a.amount
        bValue = b.amount
        break
      case "balance":
        aValue = a.balance
        bValue = b.balance
        break
      default:
        return 0
    }

    if (sortDirection === "asc") {
      return aValue > bValue ? 1 : -1
    }
    return aValue < bValue ? 1 : -1
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "trading":
        return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
      case "deposit":
        return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
      case "withdrawal":
        return "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
      case "brokerage":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
      case "charges":
        return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
      case "margin":
        return "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200"
      case "reversal":
        return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300"
    }
  }

  const copyText = async (label: string, text: string, field: "id" | "description") => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
      toast({ title: "Copied", description: `${label} copied to clipboard.` })
    } catch {
      toast({ title: "Copy failed", description: "Could not access clipboard.", variant: "destructive" })
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4" />
    }
    return sortDirection === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
  }

  if (transactions.length === 0) {
    return (
      <div className="p-8 text-center rounded-xl border border-border/60 bg-card/70">
        <p className="font-medium text-foreground">No transactions found</p>
        <p className="text-sm text-muted-foreground mt-1">Try adjusting filters or date range.</p>
      </div>
    )
  }

  return (
    <>
      <div className="md:hidden space-y-3 p-3 sm:p-4">
        {sortedTransactions.map((transaction, index) => (
          <motion.div
            key={transaction.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.03 }}
            className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-card/80 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{formatDate(transaction.date)}</div>
                <div className="text-xs text-muted-foreground">{transaction.time}</div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0",
                  transaction.type === "credit"
                    ? "border-green-200 text-green-700 bg-green-50 dark:border-green-800 dark:text-green-300 dark:bg-green-950"
                    : "border-red-200 text-red-700 bg-red-50 dark:border-red-800 dark:text-red-300 dark:bg-red-950",
                )}
              >
                {transaction.type === "credit" ? "Credit" : "Debit"}
              </Badge>
            </div>
            <p
              className={cn(
                "mt-3 text-lg font-semibold tabular-nums",
                transaction.type === "credit" ? "text-green-600" : "text-red-600",
              )}
            >
              {transaction.type === "credit" ? "+" : "-"}
              {formatCurrency(transaction.amount)}
            </p>
            <p className="mt-2 text-sm text-foreground whitespace-normal wrap-break-word leading-relaxed">
              {transaction.description || "—"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className={cn("text-xs", getCategoryColor(transaction.category))}>
                {transaction.category}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setDetailTransaction(transaction)}
              >
                Details
              </Button>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="hidden lg:block overflow-x-hidden rounded-xl border border-border/60 bg-card/70 max-h-[520px] overflow-y-auto scrollbar-mini min-w-0">
        <Table className="w-full text-sm table-auto">
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
            <TableRow>
              <TableHead className="w-[140px]">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("date")}
                  className="h-auto p-0 font-semibold hover:bg-transparent"
                >
                  Date & Time
                  <SortIcon field="date" />
                </Button>
              </TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[120px]">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("amount")}
                  className="h-auto p-0 font-semibold hover:bg-transparent"
                >
                  Amount
                  <SortIcon field="amount" />
                </Button>
              </TableHead>
              <TableHead className="min-w-0">Description</TableHead>
              <TableHead className="w-[120px]">Category</TableHead>
              <TableHead className="w-[110px]">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("balance")}
                  className="h-auto p-0 font-semibold hover:bg-transparent"
                >
                  Balance
                  <SortIcon field="balance" />
                </Button>
              </TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTransactions.map((transaction, index) => (
              <motion.tr
                key={transaction.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="group hover:bg-muted/50"
              >
                <TableCell className="align-top">
                  <div>
                    <div className="font-medium">{formatDate(transaction.date)}</div>
                    <div className="text-sm text-muted-foreground">{transaction.time}</div>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <Badge
                    variant="outline"
                    className={cn(
                      transaction.type === "credit"
                        ? "border-green-200 text-green-700 bg-green-50 dark:border-green-800 dark:text-green-300 dark:bg-green-950"
                        : "border-red-200 text-red-700 bg-red-50 dark:border-red-800 dark:text-red-300 dark:bg-red-950",
                    )}
                  >
                    {transaction.type === "credit" ? "Credit" : "Debit"}
                  </Badge>
                </TableCell>
                <TableCell className="align-top">
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      transaction.type === "credit" ? "text-green-600" : "text-red-600",
                    )}
                  >
                    {transaction.type === "credit" ? "+" : "-"}
                    {formatCurrency(transaction.amount)}
                  </span>
                </TableCell>
                <TableCell className="min-w-0 max-w-[min(100%,36rem)] align-top">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-sm whitespace-normal wrap-break-word leading-relaxed">
                      {transaction.description || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono break-all">ID: {transaction.id}</p>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant="secondary" className={getCategoryColor(transaction.category)}>
                    {transaction.category}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm align-top">{formatCurrency(transaction.balance)}</TableCell>
                <TableCell className="align-top">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setDetailTransaction(transaction)}>View Details</DropdownMenuItem>
                      <DropdownMenuItem disabled>Download Receipt</DropdownMenuItem>
                      <DropdownMenuItem disabled>Report Issue</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!detailTransaction} onOpenChange={(open) => !open && setDetailTransaction(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border-border/80 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Transaction details</DialogTitle>
            <DialogDescription className="text-sm">Full description and identifiers for support or records.</DialogDescription>
          </DialogHeader>
          {detailTransaction && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">When</div>
                <div className="font-medium text-foreground">
                  {formatDate(detailTransaction.date)} · {detailTransaction.time}
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Amount</div>
                <div
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    detailTransaction.type === "credit" ? "text-green-600" : "text-red-600",
                  )}
                >
                  {detailTransaction.type === "credit" ? "+" : "-"}
                  {formatCurrency(detailTransaction.amount)}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">{detailTransaction.type === "credit" ? "Credit" : "Debit"}</Badge>
                  <Badge variant="secondary" className={getCategoryColor(detailTransaction.category)}>
                    {detailTransaction.category}
                  </Badge>
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">Description</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1"
                    onClick={() => copyText("Description", detailTransaction.description || "", "description")}
                  >
                    {copiedField === "description" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy
                  </Button>
                </div>
                <p className="text-sm whitespace-pre-wrap wrap-break-word text-foreground leading-relaxed">
                  {detailTransaction.description || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">Transaction ID</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1"
                    onClick={() => copyText("ID", detailTransaction.id, "id")}
                  >
                    {copiedField === "id" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy
                  </Button>
                </div>
                <code className="text-xs font-mono break-all text-foreground block bg-background/50 rounded-lg p-2 border border-border/50">
                  {detailTransaction.id}
                </code>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
