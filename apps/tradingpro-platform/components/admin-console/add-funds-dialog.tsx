/**
 * @file add-funds-dialog.tsx
 * @module admin-console
 * @description Professional add funds dialog with searchable user selector
 * @author StockTrade
 * @created 2025-01-27
 */

"use client"

import type React from "react"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, DollarSign, CreditCard, FileText, Upload, Check, Search, Loader2, X } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { normalizeAdminAddFundsAmountInput } from "@/components/admin-console/fund-number-utils"

interface User {
  id: string
  name: string | null
  email: string | null
  clientId: string | null
  phone: string | null
}

interface AddFundsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddFundsDialog({ open, onOpenChange }: AddFundsDialogProps) {
  const [formData, setFormData] = useState({
    userId: "",
    amount: "",
    method: "",
    utrCode: "",
    description: "",
    screenshot: null as File | null,
  })
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [userSearch, setUserSearch] = useState("")
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showUserSelector, setShowUserSelector] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const userSelectorRef = useRef<HTMLDivElement>(null)

  // Close user selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userSelectorRef.current && !userSelectorRef.current.contains(event.target as Node)) {
        setShowUserSelector(false)
      }
    }

    if (showUserSelector) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserSelector])

  // Fetch users for search
  const fetchUsers = useCallback(async (search: string = "") => {
    console.log("🔍 [ADD-FUNDS-DIALOG] Fetching users with search:", search)
    setLoadingUsers(true)
    try {
      const response = await fetch(`/api/admin/users/list?search=${encodeURIComponent(search)}&limit=50`)
      if (response.ok) {
        const data = await response.json()
        console.log("✅ [ADD-FUNDS-DIALOG] Users fetched:", data.users?.length || 0)
        setUsers(data.users || [])
      } else {
        console.error("❌ [ADD-FUNDS-DIALOG] Failed to fetch users")
        toast({
          title: "Error",
          description: "Failed to fetch users",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("❌ [ADD-FUNDS-DIALOG] Error fetching users:", error)
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive"
      })
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  // Debounced search effect
  useEffect(() => {
    if (showUserSelector && open) {
      const timeoutId = setTimeout(() => {
        fetchUsers(userSearch)
      }, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [userSearch, showUserSelector, open, fetchUsers])

  // Load initial users when dialog opens
  useEffect(() => {
    if (open && showUserSelector) {
      fetchUsers("")
    }
  }, [open, showUserSelector, fetchUsers])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate user selection
    if (!selectedUser || !selectedUser.id) {
      toast({
        title: "Error",
        description: "Please select a user",
        variant: "destructive"
      })
      return
    }

    console.log("💰 [ADD-FUNDS-DIALOG] Submitting add funds request:", { ...formData, userId: selectedUser.id, selectedUser })
    
    setLoading(true)
    
    try {
      const normalizedAmount = normalizeAdminAddFundsAmountInput(formData.amount)
      if (normalizedAmount === null) {
        throw new Error("Amount must be a positive number")
      }
      const response = await fetch('/api/admin/funds/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount: normalizedAmount,
          description: formData.description || `Manual credit via ${formData.method} - UTR: ${formData.utrCode}`
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add funds')
      }

      console.log("✅ [ADD-FUNDS-DIALOG] Funds added successfully:", data)
      toast({
        title: "Success",
        description: `₹${formData.amount} added to ${selectedUser.name || selectedUser.email}'s account`
      })
      setIsSubmitted(true)
      
      setTimeout(() => {
        handleClose()
        window.location.reload() // Refresh to show updated data
      }, 2000)

    } catch (error: any) {
      console.error("❌ [ADD-FUNDS-DIALOG] Error adding funds:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to add funds",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      userId: "",
      amount: "",
      method: "",
      utrCode: "",
      description: "",
      screenshot: null,
    })
    setSelectedUser(null)
    setUserSearch("")
    setUsers([])
    setShowUserSelector(false)
    setIsSubmitted(false)
    onOpenChange(false)
  }

  const handleUserSelect = (user: User) => {
    console.log("👤 [ADD-FUNDS-DIALOG] User selected:", user)
    setSelectedUser(user)
    setFormData({ ...formData, userId: user.id })
    setShowUserSelector(false)
    setUserSearch("")
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFormData({ ...formData, screenshot: file })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-md bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="text-lg sm:text-xl font-bold text-primary">Add Funds Manually</DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-muted-foreground">
            Manually add funds to a user's account with transaction details
          </DialogDescription>
        </DialogHeader>

        {!isSubmitted ? (
          <motion.form
            onSubmit={handleSubmit}
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="space-y-2">
              <Label htmlFor="userSelect" className="text-foreground">
                Select User *
              </Label>
              {selectedUser ? (
                <Card className="bg-muted/30 border-border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{selectedUser.name || "Unknown"}</p>
                      <p className="text-sm text-muted-foreground truncate">{selectedUser.email}</p>
                      <p className="text-xs text-muted-foreground">ID: {selectedUser.clientId || selectedUser.id}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(null)
                        setFormData({ ...formData, userId: "" })
                      }}
                      className="ml-2 h-8 w-8 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ) : (
                <div className="relative" ref={userSelectorRef}>
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                  <Input
                    id="userSelect"
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value)
                      setShowUserSelector(true)
                    }}
                    onFocus={() => setShowUserSelector(true)}
                    className="pl-10 bg-muted/50 border-border focus:border-primary"
                    placeholder="Search by name, email, client ID, or phone..."
                  />
                  {showUserSelector && (
                    <Card className="absolute z-50 w-full mt-2 bg-card border-border shadow-lg max-h-64 overflow-y-auto">
                      <CardContent className="p-2">
                        {loadingUsers ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : users.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            {userSearch ? "No users found" : "Start typing to search users"}
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {users.map((user) => (
                              <div
                                key={user.id}
                                onClick={() => handleUserSelect(user)}
                                className="flex items-center space-x-3 p-2 hover:bg-muted rounded cursor-pointer transition-colors"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {user.name || user.email || "Unknown"}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {user.email && user.name ? user.email : user.clientId || user.id}
                                  </p>
                                  {user.clientId && (
                                    <p className="text-xs text-muted-foreground">ID: {user.clientId}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-foreground">
                Amount
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="pl-10 bg-muted/50 border-border focus:border-primary"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="method" className="text-foreground">
                Payment Method
              </Label>
              <Select value={formData.method} onValueChange={(value) => setFormData({ ...formData, method: value })}>
                <SelectTrigger className="bg-muted/50 border-border focus:border-primary">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="bank-transfer">Bank Transfer</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="neft">NEFT</SelectItem>
                  <SelectItem value="rtgs">RTGS</SelectItem>
                  <SelectItem value="imps">IMPS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="utrCode" className="text-foreground">
                UTR / Transaction Code
              </Label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="utrCode"
                  value={formData.utrCode}
                  onChange={(e) => setFormData({ ...formData, utrCode: e.target.value })}
                  className="pl-10 bg-muted/50 border-border focus:border-primary"
                  placeholder="Enter UTR or transaction code"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="screenshot" className="text-foreground">
                Transaction Screenshot
              </Label>
              <div className="relative">
                <input id="screenshot" type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("screenshot")?.click()}
                  className="w-full border-border hover:bg-muted/50"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {formData.screenshot ? formData.screenshot.name : "Upload Screenshot"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-foreground">
                Description (Optional)
              </Label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="pl-10 bg-muted/50 border-border focus:border-primary resize-none"
                  placeholder="Add any additional notes..."
                  rows={3}
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
              {loading ? "Adding Funds..." : "Add Funds"}
            </Button>
          </motion.form>
        ) : (
          <motion.div
            className="space-y-4 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="w-16 h-16 bg-green-400/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Funds Added Successfully!</h3>
            <p className="text-sm text-muted-foreground">
              ₹{formData.amount} has been added to {selectedUser?.name || selectedUser?.email || "user"}'s account
            </p>
            <Card className="bg-muted/30 border-border">
              <CardContent className="p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UTR Code:</span>
                    <code className="text-primary font-mono">{formData.utrCode}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Method:</span>
                    <span className="text-foreground capitalize">{formData.method.replace("-", " ")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  )
}
