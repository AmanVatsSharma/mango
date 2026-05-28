/**
 * @file add-bank-account-dialog.tsx
 * @module components/console/bank-accounts
 * @description Dialog form for adding a new linked bank account with validation and default selection support.
 * @author StockTrade
 * @created 2026-02-16
 */

"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Plus } from "lucide-react"
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

interface AddBankAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (account: Omit<BankAccount, "id">) => void
  existingAccounts: BankAccount[]
}

export function AddBankAccountDialog({ open, onOpenChange, onAdd, existingAccounts }: AddBankAccountDialogProps) {
  const [formData, setFormData] = useState({
    bankName: "",
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: "savings" as "savings" | "current",
    isDefault: existingAccounts.length === 0, // First account is default
  })
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (formData.accountNumber !== formData.confirmAccountNumber) {
      toast({
        title: "Account Number Mismatch",
        description: "Account numbers do not match",
        variant: "destructive",
      })
      return
    }

    if (formData.accountNumber.length < 9 || formData.accountNumber.length > 18) {
      toast({
        title: "Invalid Account Number",
        description: "Account number must be between 9-18 digits",
        variant: "destructive",
      })
      return
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifscCode)) {
      toast({
        title: "Invalid IFSC Code",
        description: "Please enter a valid IFSC code",
        variant: "destructive",
      })
      return
    }

    // Check for duplicate account
    const isDuplicate = existingAccounts.some(
      (acc) => acc.accountNumber === formData.accountNumber && acc.ifscCode === formData.ifscCode,
    )

    if (isDuplicate) {
      toast({
        title: "Account Already Exists",
        description: "This bank account is already linked",
        variant: "destructive",
      })
      return
    }

    if (existingAccounts.length >= 5) {
      toast({
        title: "Account Limit Reached",
        description: "You can link maximum 5 bank accounts",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      // Call the actual API via the hook
      await onAdd({
        bankName: formData.bankName,
        accountNumber: formData.accountNumber,
        ifscCode: formData.ifscCode.toUpperCase(),
        accountHolderName: formData.accountHolderName,
        accountType: formData.accountType,
        isDefault: formData.isDefault,
        isActive: true,
      })

      // Reset form
      setFormData({
        bankName: "",
        accountNumber: "",
        confirmAccountNumber: "",
        ifscCode: "",
        accountHolderName: "",
        accountType: "savings",
        isDefault: false,
      })

      onOpenChange(false)
    } catch (error) {
      console.error('Error adding bank account:', error)
      toast({
        title: "Error",
        description: "Failed to add bank account. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md lg:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Bank Account
          </DialogTitle>
          <DialogDescription>
            Link a new bank account for deposits and withdrawals. All details will be verified.
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

          {/* Account Number */}
          <div className="space-y-2">
            <Label htmlFor="accountNumber">Account Number</Label>
            <Input
              id="accountNumber"
              type="number"
              value={formData.accountNumber}
              onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
              placeholder="Enter account number"
              required
            />
          </div>

          {/* Confirm Account Number */}
          <div className="space-y-2">
            <Label htmlFor="confirmAccountNumber">Confirm Account Number</Label>
            <Input
              id="confirmAccountNumber"
              type="number"
              value={formData.confirmAccountNumber}
              onChange={(e) => setFormData({ ...formData, confirmAccountNumber: e.target.value })}
              placeholder="Re-enter account number"
              required
            />
          </div>

          {/* IFSC Code */}
          <div className="space-y-2">
            <Label htmlFor="ifscCode">IFSC Code</Label>
            <Input
              id="ifscCode"
              value={formData.ifscCode}
              onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
              placeholder="e.g., HDFC0001234"
              maxLength={11}
              required
            />
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
          {existingAccounts.length > 0 && (
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
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Adding Account..." : "Add Account"}
            </Button>
          </DialogFooter>
        </motion.form>
      </DialogContent>
    </Dialog>
  )
}
