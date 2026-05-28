"use client"

/**
 * @file deposit-history.tsx
 * @module components/console/deposits
 * @description Deposit history table with responsive desktop sticky-header surface behavior.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-25
 */

import { motion } from "framer-motion"
import { Clock, CheckCircle, XCircle, Copy } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { DepositRecord } from "./deposit-types"

interface DepositHistoryProps {
  deposits: DepositRecord[]
}

export function DepositHistory({ deposits }: DepositHistoryProps) {
  const { toast } = useToast()

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

  const getStatusIcon = (status: string) => {
    const s = status.toUpperCase()
    switch (s) {
      case "COMPLETED":
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case "PENDING":
      case "PROCESSING":
        return <Clock className="w-4 h-4 text-orange-600" />
      case "FAILED":
      case "CANCELLED":
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    const s = status.toUpperCase()
    switch (s) {
      case "COMPLETED":
        return "border-green-200 text-green-700 bg-green-50 dark:border-green-800 dark:text-green-300 dark:bg-green-950"
      case "PENDING":
      case "PROCESSING":
        return "border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:bg-orange-950"
      case "FAILED":
      case "CANCELLED":
        return "border-red-200 text-red-700 bg-red-50 dark:border-red-800 dark:text-red-300 dark:bg-red-950"
      default:
        return "border-gray-200 text-gray-700 bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:bg-gray-950"
    }
  }

  const isTerminalRejectionStatus = (status: string) => {
    const s = status.toUpperCase()
    return s === "FAILED" || s === "CANCELLED"
  }

  const getMethodBadge = (method: string) => {
    switch (method) {
      case "upi":
        return "UPI"
      case "bank":
        return "Bank Transfer"
      case "cash":
        return "Cash Deposit"
      default:
        return method.toUpperCase()
    }
  }

  const copyUTR = async (utr: string) => {
    try {
      await navigator.clipboard.writeText(utr)
      toast({
        title: "Copied!",
        description: "UTR number copied to clipboard",
      })
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      })
    }
  }

  if (deposits.length === 0) {
    return (
      <div className="p-8 text-center rounded-xl border border-border/60 bg-card/70">
        <p className="font-medium text-foreground">No deposits found</p>
        <p className="text-sm text-muted-foreground mt-1">Make your first deposit to get started.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/70 lg:max-h-[460px] lg:overflow-y-auto scrollbar-mini">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <TableRow>
            <TableHead>Date & Time</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>UTR</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deposits.map((deposit, index) => (
            <motion.tr
              key={deposit.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="group hover:bg-muted/50"
            >
              <TableCell>
                <div>
                  <div className="font-medium">{deposit.createdAt ? formatDate(deposit.createdAt) : '-'}</div>
                  <div className="text-sm text-muted-foreground">{deposit.createdAt ? new Date(deposit.createdAt).toLocaleTimeString("en-IN") : '-'}</div>
                </div>
              </TableCell>
              <TableCell>
                <span className="font-semibold text-green-600">{formatCurrency(deposit.amount)}</span>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{getMethodBadge(deposit.method)}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("gap-1", getStatusColor(deposit.status))}>
                  {getStatusIcon(deposit.status)}
                  {String(deposit.status).toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[240px] sm:max-w-xs">
                {deposit.remarks?.trim() ? (
                  <div className="space-y-0.5">
                    {isTerminalRejectionStatus(deposit.status) && (
                      <p className="text-xs font-medium text-destructive">Rejection reason</p>
                    )}
                    <p
                      className={cn(
                        "text-sm leading-snug wrap-break-word",
                        isTerminalRejectionStatus(deposit.status)
                          ? "text-destructive/90"
                          : "text-muted-foreground"
                      )}
                    >
                      {deposit.remarks.trim()}
                    </p>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell>
                <span className="font-mono text-sm">{deposit.reference}</span>
              </TableCell>
              <TableCell>
                {deposit.utr ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{deposit.utr}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyUTR(deposit.utr!)}
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
