"use client"

/**
 * @file withdrawals-list.tsx
 * @module components/console/withdrawals
 * @description Withdrawal history table with sorting and desktop-friendly sticky header presentation.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-25
 */

import { useState } from "react"
import { motion } from "framer-motion"
import { Clock, CheckCircle, XCircle, AlertCircle, Building2, MoreHorizontal, ArrowUpDown } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { WithdrawalRecord } from "./withdrawal-types"

interface WithdrawalsListProps {
  withdrawals: WithdrawalRecord[]
}

type SortField = "requestDate" | "amount" | "status"
type SortDirection = "asc" | "desc"

export function WithdrawalsList({ withdrawals }: WithdrawalsListProps) {
  const [sortField, setSortField] = useState<SortField>("requestDate")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const sortedWithdrawals = [...withdrawals].sort((a, b) => {
    let aValue: any
    let bValue: any

    switch (sortField) {
      case "requestDate":
        aValue = new Date(a.requestDate).getTime()
        bValue = new Date(b.requestDate).getTime()
        break
      case "amount":
        aValue = a.amount
        bValue = b.amount
        break
      case "status":
        aValue = a.status
        bValue = b.status
        break
      default:
        return 0
    }

    if (sortDirection === "asc") {
      return aValue > bValue ? 1 : -1
    } else {
      return aValue < bValue ? 1 : -1
    }
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

  const normalizeStatus = (status: string) => String(status).toLowerCase()

  const getStatusIcon = (status: string) => {
    switch (normalizeStatus(status)) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case "processing":
        return <AlertCircle className="w-4 h-4 text-blue-600" />
      case "pending":
        return <Clock className="w-4 h-4 text-orange-600" />
      case "failed":
      case "cancelled":
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (normalizeStatus(status)) {
      case "completed":
        return "border-green-200 text-green-700 bg-green-50 dark:border-green-800 dark:text-green-300 dark:bg-green-950"
      case "processing":
        return "border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:bg-blue-950"
      case "pending":
        return "border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:bg-orange-950"
      case "failed":
      case "cancelled":
        return "border-red-200 text-red-700 bg-red-50 dark:border-red-800 dark:text-red-300 dark:bg-red-950"
      default:
        return "border-gray-200 text-gray-700 bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:bg-gray-950"
    }
  }

  const isTerminalRejectionStatus = (status: string) => {
    const s = normalizeStatus(status)
    return s === "failed" || s === "cancelled"
  }

  const formatStatusLabel = (status: string) => {
    const s = normalizeStatus(status)
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4" />
    }
    return sortDirection === "asc" ? (
      <motion.div animate={{ rotate: 180 }}>
        <ArrowUpDown className="w-4 h-4" />
      </motion.div>
    ) : (
      <ArrowUpDown className="w-4 h-4" />
    )
  }

  if (withdrawals.length === 0) {
    return (
      <div className="p-8 text-center rounded-xl border border-border/60 bg-card/70">
        <p className="font-medium text-foreground">No withdrawal requests found</p>
        <p className="text-sm text-muted-foreground mt-1">Create your first withdrawal request.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/70 lg:max-h-[520px] lg:overflow-y-auto scrollbar-mini">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <TableRow>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("requestDate")}
                className="h-auto p-0 font-semibold hover:bg-transparent"
              >
                Request Date
                <SortIcon field="requestDate" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("amount")}
                className="h-auto p-0 font-semibold hover:bg-transparent"
              >
                Amount
                <SortIcon field="amount" />
              </Button>
            </TableHead>
            <TableHead>Bank Account</TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("status")}
                className="h-auto p-0 font-semibold hover:bg-transparent"
              >
                Status
                <SortIcon field="status" />
              </Button>
            </TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Processed Date</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedWithdrawals.map((withdrawal, index) => (
            <motion.tr
              key={withdrawal.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="group hover:bg-muted/50"
            >
              <TableCell>
                <div>
                  <div className="font-medium">{formatDate(withdrawal.requestDate)}</div>
                  <div className="text-sm text-muted-foreground">{withdrawal.requestTime}</div>
                </div>
              </TableCell>
              <TableCell>
                <div>
                  <span className="font-semibold text-blue-600">{formatCurrency(withdrawal.amount)}</span>
                  {withdrawal.charges > 0 && (
                    <div className="text-xs text-muted-foreground">Charges: {formatCurrency(withdrawal.charges)}</div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">{withdrawal.bankAccount.bankName}</div>
                    <div className="text-xs text-muted-foreground">
                      ****{(withdrawal.bankAccount.accountNumber || "0000").slice(-4)}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("gap-1", getStatusColor(withdrawal.status))}>
                  {getStatusIcon(withdrawal.status)}
                  {formatStatusLabel(withdrawal.status)}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[240px] sm:max-w-xs">
                {withdrawal.remarks?.trim() ? (
                  <div className="space-y-0.5">
                    {isTerminalRejectionStatus(withdrawal.status) && (
                      <p className="text-xs font-medium text-destructive">Rejection reason</p>
                    )}
                    <p
                      className={cn(
                        "text-sm leading-snug wrap-break-word",
                        isTerminalRejectionStatus(withdrawal.status)
                          ? "text-destructive/90"
                          : "text-muted-foreground"
                      )}
                    >
                      {withdrawal.remarks.trim()}
                    </p>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell>
                <span className="font-mono text-sm">{withdrawal.reference}</span>
              </TableCell>
              <TableCell>
                {withdrawal.processedDate ? (
                  <div>
                    <div className="font-medium text-sm">{formatDate(withdrawal.processedDate)}</div>
                    <div className="text-xs text-muted-foreground">{withdrawal.processedTime}</div>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>View Details</DropdownMenuItem>
                    <DropdownMenuItem>Download Receipt</DropdownMenuItem>
                    {normalizeStatus(withdrawal.status) === "pending" && (
                      <DropdownMenuItem className="text-red-600">Cancel Request</DropdownMenuItem>
                    )}
                    <DropdownMenuItem>Report Issue</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
