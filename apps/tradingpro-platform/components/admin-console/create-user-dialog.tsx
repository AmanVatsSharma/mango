/**
 * @file create-user-dialog.tsx
 * @module admin-console
 * @description Professional user creation dialog with API integration
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-03 — Credential display uses client-held password only (API does not return plaintext).
 */

"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Copy, Check, User, Mail, Phone, Key, Shield, Loader2, Eye, EyeOff } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { normalizeAdminOptionalNonNegativeAmountInput } from "@/components/admin-console/fund-number-utils"

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    initialBalance: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [generatedCredentials, setGeneratedCredentials] = useState<{
    clientId: string
    password: string
    name: string
    email: string
    phone: string
    initialBalance: number
  } | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Generate a secure random password
  const generatePassword = () => {
    const length = 12
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    let password = ""
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length))
    }
    return password
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log("👤 [CREATE-USER-DIALOG] Submitting user creation request:", {
      name: formData.name,
      email: formData.email,
      phone: formData.phone ? "***" : undefined,
      hasPassword: !!formData.password,
      hasInitialBalance: !!formData.initialBalance
    })

    // Validate form
    if (!formData.name || !formData.email || !formData.phone) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      })
      return
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      toast({
        title: "Error",
        description: "Please enter a valid email address",
        variant: "destructive"
      })
      return
    }

    // Validate phone format
    if (formData.phone.length < 10) {
      toast({
        title: "Error",
        description: "Please enter a valid phone number",
        variant: "destructive"
      })
      return
    }

    // Use provided password or generate one
    const password = formData.password || generatePassword()
    const normalizedInitialBalance = normalizeAdminOptionalNonNegativeAmountInput(formData.initialBalance)
    if (formData.initialBalance.trim() !== "" && normalizedInitialBalance === undefined) {
      toast({
        title: "Error",
        description: "Initial balance must be a non-negative number",
        variant: "destructive"
      })
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          password: password,
          initialBalance: normalizedInitialBalance
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      console.log("✅ [CREATE-USER-DIALOG] User created successfully:", data.user)

      setGeneratedCredentials({
        clientId: data.user.clientId,
        password,
        name: data.user.name,
        email: data.user.email,
        phone: data.user.phone,
        initialBalance: data.user.initialBalance || 0,
      })

      toast({
        title: "Success",
        description: typeof data.message === "string" ? data.message : "User created successfully",
      })

    } catch (error: any) {
      console.error("❌ [CREATE-USER-DIALOG] Error creating user:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleClose = () => {
    setFormData({ name: "", email: "", phone: "", password: "", initialBalance: "" })
    setGeneratedCredentials(null)
    setCopiedField(null)
    setShowPassword(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-md bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="text-lg sm:text-xl font-bold text-primary">Create New User</DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-muted-foreground">
            Generate a new trading account with credentials
          </DialogDescription>
        </DialogHeader>

        {!generatedCredentials ? (
          <motion.form
            onSubmit={handleSubmit}
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">
                Full Name
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="pl-10 bg-muted/50 border-border focus:border-primary"
                  placeholder="Enter full name"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="pl-10 bg-muted/50 border-border focus:border-primary"
                  placeholder="Enter email address"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-foreground">
                Phone Number *
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="pl-10 bg-muted/50 border-border focus:border-primary"
                  placeholder="Enter phone number"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">
                Password (Optional - will be auto-generated if empty)
              </Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="pl-10 pr-10 bg-muted/50 border-border focus:border-primary"
                  placeholder="Leave empty to auto-generate"
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Minimum 8 characters. If empty, a secure password will be generated.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="balance" className="text-foreground">
                Initial Balance (Optional)
              </Label>
              <Input
                id="balance"
                type="number"
                step="0.01"
                min="0"
                value={formData.initialBalance}
                onChange={(e) => setFormData({ ...formData, initialBalance: e.target.value })}
                className="bg-muted/50 border-border focus:border-primary"
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">Initial balance to credit to the trading account</p>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating User...
                </>
              ) : (
                "Create User Account"
              )}
            </Button>
          </motion.form>
        ) : (
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-green-400/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-lg font-bold text-foreground">User Created Successfully!</h3>
              <p className="text-sm text-muted-foreground">Share these credentials with the user</p>
            </div>

            <Card className="bg-muted/30 border-border">
              <CardContent className="p-4 space-y-3">
                <div className="space-y-2 pb-3 border-b border-border">
                  <p className="text-sm font-medium text-foreground">User Details</p>
                  <p className="text-xs text-muted-foreground">Name: {generatedCredentials.name}</p>
                  <p className="text-xs text-muted-foreground">Email: {generatedCredentials.email}</p>
                  <p className="text-xs text-muted-foreground">Phone: {generatedCredentials.phone}</p>
                  {generatedCredentials.initialBalance > 0 && (
                    <p className="text-xs text-muted-foreground">Initial Balance: ₹{generatedCredentials.initialBalance.toLocaleString()}</p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Client ID</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <code className="text-primary font-mono text-sm bg-primary/10 px-2 py-1 rounded">
                      {generatedCredentials.clientId}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(generatedCredentials.clientId, "clientId")}
                      className="h-6 w-6 p-0"
                    >
                      {copiedField === "clientId" ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Key className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm font-medium text-foreground">Password</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <code className="text-yellow-400 font-mono text-sm bg-yellow-400/10 px-2 py-1 rounded break-all">
                      {generatedCredentials.password}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(generatedCredentials.password, "password")}
                      className="h-6 w-6 p-0"
                    >
                      {copiedField === "password" ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-3">
              <p className="text-xs text-yellow-400">
                <strong>Important:</strong> Save these credentials securely. The password cannot be recovered once this dialog is closed. 
                The user will need to set up their MPIN on first login.
              </p>
            </div>

            <Button onClick={handleClose} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              Close & Create Another
            </Button>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  )
}
