/**
 * @file edit-bank-account-dialog.tsx
 * @module components/console/bank-accounts
 * @description Dialog form for updating linked bank account metadata and default-account state.
 * @author StockTrade
 * @created 2026-02-16
 */

"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Edit } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import type { BankAccount } from "../withdrawals/withdrawal-types"

interface EditBankAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: BankAccount | null
  onEdit: (account: BankAccount) => void
  existingAccounts: BankAccount[]
}

export function EditBankAccountDialog({
  open,
  onOpenChange,
  account,
  onEdit,
  existingAccounts,
}: EditBankAccountDialogProps) {
  const [formData, setFormData] = useState({
    bankName: "",
    accountHolderName: "",
    accountType: "savings" as "savings" | "current",
    isDefault: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (account) {
      setFormData({
        bankName: account.bankName,
        accountHolderName: account.accountHolderName,
        accountType: account.accountType,
        isDefault: account.isDefault,
      })
    }
  }, [account])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!account) return

    setIsLoading(true)

    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      onEdit({
        ...account,
        bankName: formData.bankName,
        accountHolderName: formData.accountHolderName,
        accountType: formData.accountType,
        isDefault: formData.isDefault,
      })

      toast({
        title: "Account Updated",
        description: "Bank account details have been updated successfully",
      })
    }, 1500)
  }

  const popularBanks = [
    "State Bank of India",
    "HDFC Bank",
    "ICICI Bank",
    "Axis Bank",
    "Kotak Mahindra Bank",
    "Punjab National Bank",
    "Bank of Baroda",
    "Canara Bank",
    "Union Bank of India",
    "IDFC First Bank",
  ]

  if (!account) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md lg:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5" />
            Edit Bank Account
          </DialogTitle>
          <DialogDescription>
            Update your bank account details. Account number and IFSC cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {/* Bank Name */}
          <div className="space-y-2">
            <Label htmlFor="bankName">Bank Name</Label>
            <Select value={formData.bankName} onValueChange={(value) => setFormData({ ...formData, bankName: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select your bank" />
              </SelectTrigger>
              <SelectContent>
                {popularBanks.map((bank) => (
                  <SelectItem key={bank} value={bank}>
                    {bank}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account Holder Name */}
          <div className="space-y-2">
            <Label htmlFor="accountHolderName">Account Holder Name</Label>
            <Input
              id="accountHolderName"
              value={formData.accountHolderName}
              onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })}
              placeholder="As per bank records"
              required
            />
          </div>

          {/* Account Number (Read-only) */}
          <div className="space-y-2">
            <Label>Account Number</Label>
            <Input value={`****${account.accountNumber.slice(-4)}`} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Account number cannot be changed</p>
          </div>

          {/* IFSC Code (Read-only) */}
          <div className="space-y-2">
            <Label>IFSC Code</Label>
            <Input value={account.ifscCode} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">IFSC code cannot be changed</p>
          </div>

          {/* Account Type */}
          <div className="space-y-2">
            <Label>Account Type</Label>
            <Select
              value={formData.accountType}
              onValueChange={(value: "savings" | "current") => setFormData({ ...formData, accountType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="savings">Savings Account</SelectItem>
                <SelectItem value="current">Current Account</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Set as Default */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isDefault"
              checked={formData.isDefault}
              onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked as boolean })}
            />
            <Label htmlFor="isDefault" className="cursor-pointer">
              Set as default account
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Updating..." : "Update Account"}
            </Button>
          </DialogFooter>
        </motion.form>
      </DialogContent>
    </Dialog>
  )
}
