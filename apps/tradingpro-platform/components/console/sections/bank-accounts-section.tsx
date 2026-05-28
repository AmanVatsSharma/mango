"use client"

/**
 * @file bank-accounts-section.tsx
 * @module components/console/sections
 * @description Bank accounts workspace section supporting linked-account CRUD and default selection.
 * @author StockTrade
 * @created 2026-02-16
 */

import { useState } from "react"
import { motion } from "framer-motion"
import { Building2, Plus, CreditCard, Shield } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BankAccountsList } from "../bank-accounts/bank-accounts-list"
import { AddBankAccountDialog } from "../bank-accounts/add-bank-account-dialog"
import { EditBankAccountDialog } from "../bank-accounts/edit-bank-account-dialog"
import { useSession } from "next-auth/react"
import { useConsoleData } from "@/lib/hooks/use-console-data"
import { useToast } from "@/hooks/use-toast"
import type { BankAccount } from "../withdrawals/withdrawal-types"

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
  {
    id: "BA003",
    bankName: "State Bank of India",
    accountNumber: "987654321098",
    ifscCode: "SBIN0001234",
    accountHolderName: "John Doe",
    accountType: "savings",
    isDefault: false,
  },
]

export function BankAccountsSection() {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  const { toast } = useToast()

  // Get console data
  const { data: session } = useSession()
  const userId = (session?.user as any)?.id as string | undefined
  const { consoleData, isLoading, error, addBankAccount, updateBankAccount, deleteBankAccount } = useConsoleData(userId)

  const bankAccounts = consoleData?.bankAccounts || []

  const handleAddAccount = async (newAccount: Omit<BankAccount, "id" | "createdAt">) => {
    const result = await addBankAccount(newAccount)
    
    if (result.success) {
      toast({
        title: "Bank Account Added",
        description: "Your bank account has been added successfully.",
      })
      setShowAddDialog(false)
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive",
      })
    }
  }

  const handleEditAccount = async (updatedAccount: BankAccount) => {
    const result = await updateBankAccount(updatedAccount.id, updatedAccount)
    
    if (result.success) {
      toast({
        title: "Bank Account Updated",
        description: "Your bank account has been updated successfully.",
      })
      setEditingAccount(null)
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive",
      })
    }
  }

  const handleDeleteAccount = async (accountId: string) => {
    const result = await deleteBankAccount(accountId)
    
    if (result.success) {
      toast({
        title: "Bank Account Deleted",
        description: "Your bank account has been deleted successfully.",
      })
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive",
      })
    }
  }

  const handleSetDefault = async (accountId: string) => {
    const account = bankAccounts.find(acc => acc.id === accountId)
    if (!account) return

    const result = await updateBankAccount(accountId, { ...account, isDefault: true })
    
    if (result.success) {
      toast({
        title: "Default Account Updated",
        description: "Your default bank account has been updated successfully.",
      })
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive",
      })
    }
  }

  const defaultAccount = bankAccounts.find((acc) => acc.isDefault)
  const savingsAccounts = bankAccounts.filter((acc) => acc.accountType === "savings").length
  const currentAccounts = bankAccounts.filter((acc) => acc.accountType === "current").length

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading bank accounts data...
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-xl font-semibold text-destructive">Error loading bank accounts</div>
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
      <div className="space-y-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Bank Accounts</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Manage your linked bank accounts for deposits and withdrawals</p>
        </div>
        <Button 
          onClick={() => {
            console.log('🏞µ [BANK-ACCOUNTS] Opening add dialog')
            setShowAddDialog(true)
          }} 
          className="gap-2 w-full sm:w-auto touch-manipulation"
        >
          <Plus className="w-4 h-4" />
          <span>Add Bank Account</span>
        </Button>
      </div>

      {/* Summary Cards - Mobile Optimized */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Accounts</p>
                <p className="text-xl font-semibold text-blue-600">{bankAccounts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Savings Accounts</p>
                <p className="text-xl font-semibold text-green-600">{savingsAccounts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-950 rounded-lg">
                <CreditCard className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Accounts</p>
                <p className="text-xl font-semibold text-purple-600">{currentAccounts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-950 rounded-lg">
                <Shield className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Default Account</p>
                <p className="text-sm font-semibold text-orange-600">
                  {defaultAccount ? defaultAccount.bankName : "None"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bank Accounts List */}
      <Card>
        <CardHeader>
          <CardTitle>Linked Bank Accounts</CardTitle>
          <CardDescription>
            Manage your bank accounts for seamless deposits and withdrawals. You can add up to 5 bank accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <BankAccountsList
            bankAccounts={bankAccounts}
            onEdit={setEditingAccount}
            onDelete={handleDeleteAccount}
            onSetDefault={handleSetDefault}
          />
        </CardContent>
      </Card>

      {/* Add Bank Account Dialog */}
      <AddBankAccountDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddAccount}
        existingAccounts={bankAccounts}
      />

      {/* Edit Bank Account Dialog */}
      <EditBankAccountDialog
        open={!!editingAccount}
        onOpenChange={(open) => !open && setEditingAccount(null)}
        account={editingAccount}
        onEdit={handleEditAccount}
        existingAccounts={bankAccounts}
      />
    </motion.div>
  )
}
