"use client"

/**
 * @file bank-accounts-list.tsx
 * @module components/console/bank-accounts
 * @description Desktop table and mobile card list for linked bank accounts.
 * @author StockTrade
 * @created 2026-02-16
 */

import { motion } from "framer-motion"
import { Building2, Star, Edit, Trash2, MoreHorizontal } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Card, CardContent } from "@/components/ui/card"
import type { BankAccount } from "../withdrawals/withdrawal-types"

interface BankAccountsListProps {
  bankAccounts: BankAccount[]
  onEdit: (account: BankAccount) => void
  onDelete: (accountId: string) => void
  onSetDefault: (accountId: string) => void
}

export function BankAccountsList({ bankAccounts, onEdit, onDelete, onSetDefault }: BankAccountsListProps) {
  const maskAccountNumber = (accountNumber: string) => {
    return `****${accountNumber.slice(-4)}`
  }

  const getAccountTypeColor = (type: string) => {
    return type === "savings"
      ? "border-green-200 text-green-700 bg-green-50 dark:border-green-800 dark:text-green-300 dark:bg-green-950"
      : "border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:bg-blue-950"
  }

  if (bankAccounts.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
            <Building2 className="w-8 h-8 text-muted-foreground" />
          </div>
        </div>
        <h3 className="text-lg font-semibold mb-2">No Bank Accounts</h3>
        <p className="text-muted-foreground mb-4">
          Add your first bank account to start making deposits and withdrawals.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-6">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border/60 bg-card/70 lg:max-h-[520px] lg:overflow-y-auto scrollbar-mini">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
            <TableRow>
              <TableHead>Bank Details</TableHead>
              <TableHead>Account Number</TableHead>
              <TableHead>IFSC Code</TableHead>
              <TableHead>Account Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bankAccounts.map((account, index) => (
              <motion.tr
                key={account.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="group hover:bg-muted/50"
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-lg">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium">{account.bankName}</div>
                      <div className="text-sm text-muted-foreground">{account.accountHolderName}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono">{maskAccountNumber(account.accountNumber)}</span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm">{account.ifscCode}</span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getAccountTypeColor(account.accountType)}>
                    {account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {account.isDefault && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-yellow-200 text-yellow-700 bg-yellow-50 dark:border-yellow-800 dark:text-yellow-300 dark:bg-yellow-950"
                      >
                        <Star className="w-3 h-3" />
                        Default
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(account)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Account
                      </DropdownMenuItem>
                      {!account.isDefault && (
                        <DropdownMenuItem onClick={() => onSetDefault(account.id)}>
                          <Star className="mr-2 h-4 w-4" />
                          Set as Default
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => onDelete(account.id)}
                        className="text-red-600"
                        disabled={bankAccounts.length === 1}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove Account
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {bankAccounts.map((account, index) => (
          <motion.div
            key={account.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-lg">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium">{account.bankName}</div>
                      <div className="text-sm text-muted-foreground">{account.accountHolderName}</div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(account)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Account
                      </DropdownMenuItem>
                      {!account.isDefault && (
                        <DropdownMenuItem onClick={() => onSetDefault(account.id)}>
                          <Star className="mr-2 h-4 w-4" />
                          Set as Default
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => onDelete(account.id)}
                        className="text-red-600"
                        disabled={bankAccounts.length === 1}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove Account
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Account:</span>
                    <span className="font-mono">{maskAccountNumber(account.accountNumber)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">IFSC:</span>
                    <span className="font-mono">{account.ifscCode}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Type:</span>
                    <Badge variant="outline" className={getAccountTypeColor(account.accountType)}>
                      {account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1)}
                    </Badge>
                  </div>
                  {account.isDefault && (
                    <div className="flex justify-center pt-2">
                      <Badge
                        variant="outline"
                        className="gap-1 border-yellow-200 text-yellow-700 bg-yellow-50 dark:border-yellow-800 dark:text-yellow-300 dark:bg-yellow-950"
                      >
                        <Star className="w-3 h-3" />
                        Default Account
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
