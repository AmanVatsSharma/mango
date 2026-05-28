/**
 * @file edit-user-dialog.tsx
 * @module admin-console
 * @description Comprehensive user editing dialog, credentials, risk, and active session devices (read/manage per RBAC).
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-07 — Admin: Require OTP on login (hydrate from GET, sync after save).
 *
 * Notes:
 * - Read-only linked bank accounts (payout beneficiaries) loaded from GET /api/admin/users/[id].
 */

"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { User, Mail, Phone, Shield, Key, Save, X, CheckCircle, AlertCircle, TrendingUp, UserCheck, DollarSign, Wallet, AlertTriangle, FileText, Laptop, Loader2, Building2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"
import {
  normalizeEditUserAmountForDisplay,
  normalizeEditUserLeverageMultiplierInput,
  normalizeEditUserRequiredNonNegativeAmount,
} from "@/components/admin-console/edit-user-number-utils"
import {
  REVOKE_REASON_OPTIONS,
  sessionKindLabel,
  truncateNetworkKey,
} from "@/lib/session-security/policy-admin-labels"
import {
  formatAdminBankAccountSummary,
  formatAdminFullAccountForDisplay,
  formatAdminMaskedIfsc,
} from "@/lib/admin/admin-bank-display"

function formatSessionSeenIST(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "short",
    timeStyle: "short",
  })
}

type StatementOverrideMode = "default" | "force_enable" | "force_disable"

type EditUserProfileForm = {
  name: string
  email: string
  phone: string
  role: string
  isActive: boolean
  clientId: string
  bio: string
  requireOtpOnLogin: boolean
}

interface EditUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: any
  onUserUpdated?: () => void
}

export function EditUserDialog({ open, onOpenChange, user, onUserUpdated }: EditUserDialogProps) {
  const { user: adminUser, permissions } = useAdminSession()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<EditUserProfileForm>({
    name: "",
    email: "",
    phone: "",
    role: "USER",
    isActive: true,
    clientId: "",
    bio: "",
    requireOtpOnLogin: true,
  })
  const [securityOtpHydrated, setSecurityOtpHydrated] = useState(false)
  const [originalData, setOriginalData] = useState<EditUserProfileForm | null>(null)
  const [riskLimit, setRiskLimit] = useState<any>(null)
  const [baseConfigs, setBaseConfigs] = useState<any[]>([])
  const [leverageMultiplier, setLeverageMultiplier] = useState<number | null>(null)
  const [loadingRiskLimit, setLoadingRiskLimit] = useState(false)
  const [rms, setRms] = useState<any[]>([])
  const [selectedRMId, setSelectedRMId] = useState<string | null>(null)
  const [loadingRMs, setLoadingRMs] = useState(false)
  const [currentRMId, setCurrentRMId] = useState<string | null>(null)

  // Statements override (tri-state)
  const [statementOverrideMode, setStatementOverrideMode] = useState<StatementOverrideMode>("default")
  const [originalStatementOverrideMode, setOriginalStatementOverrideMode] = useState<StatementOverrideMode>("default")
  const [loadingStatementOverride, setLoadingStatementOverride] = useState(false)
  const [savingStatementOverride, setSavingStatementOverride] = useState(false)
  
  // Trading account funds state (Super Admin only)
  const [tradingAccountData, setTradingAccountData] = useState<{
    balance: string
    availableMargin: string
    usedMargin: string
  } | null>(null)
  const [originalTradingAccountData, setOriginalTradingAccountData] = useState<any>(null)
  const [fundReason, setFundReason] = useState("")
  const [userSessions, setUserSessions] = useState<
    { id: string; kind: string; jti: string | null; networkKey: string | null; revokedAt: string | null; lastSeenAt: string }[]
  >([])
  const [loadingUserSessions, setLoadingUserSessions] = useState(false)
  const [sessionRevokeTarget, setSessionRevokeTarget] = useState<{ jti: string } | null>(null)
  const [sessionRevokeReason, setSessionRevokeReason] = useState(REVOKE_REASON_OPTIONS[0].value)

  const currentUserRole = adminUser?.role ?? null
  const canAssignRms = permissions.includes("admin.users.rm") || permissions.includes("admin.all")
  const canAssignHighRoles = permissions.includes("admin.all")
  const canOverrideFunds =
    permissions.includes("admin.funds.override") || permissions.includes("admin.all")
  const canReadSessions =
    permissions.includes("admin.session-security.read") || permissions.includes("admin.all")
  const canManageSessions =
    permissions.includes("admin.session-security.manage") || permissions.includes("admin.all")
  const canRevealSensitiveBank =
    permissions.includes("admin.all") || permissions.includes("admin.users.bank.sensitive")

  const [linkedBankAccounts, setLinkedBankAccounts] = useState<
    {
      id: string
      bankName: string
      accountNumber: string
      ifscCode: string
      accountHolderName: string
      accountType: string
      isDefault: boolean
      isActive: boolean
      createdAt: string
    }[]
  >([])
  const [loadingLinkedBanks, setLoadingLinkedBanks] = useState(false)
  const [referredByUser, setReferredByUser] = useState<{
    id: string
    clientId: string | null
    name: string | null
    email: string | null
  } | null>(null)

  // Load current user role and user data when dialog opens
  useEffect(() => {
    if (open && user) {
      console.log("📝 [EDIT-USER-DIALOG] Loading user data:", user)
      setSecurityOtpHydrated(false)
      const data = {
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        role: user.role || "USER",
        isActive:
          user.isActive !== undefined
            ? user.isActive
            : user.status === "active" || user.status === "suspended",
        clientId: user.clientId || "",
        bio: user.bio || "",
        requireOtpOnLogin:
          typeof user.requireOtpOnLogin === "boolean" ? user.requireOtpOnLogin : true,
      }
      setFormData(data)
      setOriginalData(data)
      
      // Load risk limit data
      loadRiskLimit()

      // Load statements override (tri-state)
      loadStatementOverride()
      
      // Load RM assignment data
      if (canAssignRms) {
        loadRMData()
      }
      
      // Load trading account data (permission-gated: admin.funds.override)
      // Fetch full user details if tradingAccount is not available
      if (!canOverrideFunds) {
        setTradingAccountData(null)
        setOriginalTradingAccountData(null)
        return
      }

      const loadTradingAccount = async () => {
        try {
          if (user?.tradingAccount) {
            const taData = {
              balance: String(user.tradingAccount.balance || 0),
              availableMargin: String(user.tradingAccount.availableMargin || 0),
              usedMargin: String(user.tradingAccount.usedMargin || 0),
            }
            setTradingAccountData(taData)
            setOriginalTradingAccountData(taData)
            return
          }

          if (!user?.id) {
            setTradingAccountData(null)
            setOriginalTradingAccountData(null)
            return
          }

          const response = await fetch(`/api/admin/users/${user.id}`)
          const payload = await response.json().catch(() => ({}))
          const ta = payload?.user?.tradingAccount
          if (!ta) {
            setTradingAccountData(null)
            setOriginalTradingAccountData(null)
            return
          }

          const taData = {
            balance: String(ta.balance || 0),
            availableMargin: String(ta.availableMargin || 0),
            usedMargin: String(ta.usedMargin || 0),
          }
          setTradingAccountData(taData)
          setOriginalTradingAccountData(taData)
        } catch {
          setTradingAccountData(null)
          setOriginalTradingAccountData(null)
        }
      }

      void loadTradingAccount()
    }
  }, [open, user, canAssignRms, canOverrideFunds])

  useEffect(() => {
    if (!open || !user?.id) {
      setLinkedBankAccounts([])
      setReferredByUser(null)
      return
    }
    let cancelled = false
    const loadBanks = async () => {
      setLoadingLinkedBanks(true)
      try {
        const res = await fetch(`/api/admin/users/${user.id}`)
        const data = await res.json().catch(() => ({}))
        const detail = data?.user
        if (!cancelled && detail) {
          const otp = detail.requireOtpOnLogin ?? true
          setFormData((prev) => ({ ...prev, requireOtpOnLogin: otp }))
          setOriginalData((prev) => (prev ? { ...prev, requireOtpOnLogin: otp } : null))
          setReferredByUser(detail.referredBy ?? null)
        }
        if (!cancelled) {
          if (!res.ok || !detail) {
            setLinkedBankAccounts([])
            if (!detail) setReferredByUser(null)
          } else {
            const list = Array.isArray(detail.bankAccounts) ? detail.bankAccounts : []
            setLinkedBankAccounts(list)
          }
        }
      } catch {
        if (!cancelled) setLinkedBankAccounts([])
      } finally {
        if (!cancelled) {
          setLoadingLinkedBanks(false)
          setSecurityOtpHydrated(true)
        }
      }
    }
    void loadBanks()
    return () => {
      cancelled = true
    }
  }, [open, user?.id])

  useEffect(() => {
    if (!open || !user?.id || !canReadSessions) {
      setUserSessions([])
      return
    }
    let cancelled = false
    const load = async () => {
      setLoadingUserSessions(true)
      try {
        const params = new URLSearchParams({ userId: user.id, limit: "50", page: "0" })
        const res = await fetch(`/api/admin/session-security/sessions?${params}`, { credentials: "include" })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.message || "Failed to load sessions")
        if (!cancelled) setUserSessions(json.data?.sessions ?? [])
      } catch (e) {
        if (!cancelled) {
          setUserSessions([])
          toast({ title: "Sessions", description: (e as Error).message, variant: "destructive" })
        }
      } finally {
        if (!cancelled) setLoadingUserSessions(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, user?.id, canReadSessions])

  const reloadUserSessions = async () => {
    if (!user?.id || !canReadSessions) return
    const params = new URLSearchParams({ userId: user.id, limit: "50", page: "0" })
    const res = await fetch(`/api/admin/session-security/sessions?${params}`, { credentials: "include" })
    const json = await res.json()
    if (res.ok) setUserSessions(json.data?.sessions ?? [])
  }

  const confirmRevokeUserSession = async () => {
    if (!canManageSessions || !sessionRevokeTarget?.jti) return
    try {
      const res = await fetch(`/api/admin/session-security/sessions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jti: sessionRevokeTarget.jti, reason: sessionRevokeReason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Revoke failed")
      toast({ title: "Session revoked" })
      setSessionRevokeTarget(null)
      await reloadUserSessions()
    } catch (e) {
      toast({ title: "Revoke", description: (e as Error).message, variant: "destructive" })
    }
  }

  const revokeAllActiveSessionsForUser = async () => {
    if (!canManageSessions || !user?.id) return
    if (!window.confirm("Sign this user out of all devices? This revokes every active session.")) return
    try {
      const res = await fetch(`/api/admin/session-security/sessions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          revokeAllForUser: true,
          reason: sessionRevokeReason,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Revoke failed")
      toast({
        title: "Sessions revoked",
        description: `Revoked ${json.data?.revoked ?? 0} session(s).`,
      })
      await reloadUserSessions()
    } catch (e) {
      toast({ title: "Revoke all", description: (e as Error).message, variant: "destructive" })
    }
  }

  const loadRMData = async () => {
    if (!user?.id) return
    
    setLoadingRMs(true)
    try {
      // Fetch current user's RM assignment
      const userResponse = await fetch(`/api/admin/users/${user.id}`)
      if (userResponse.ok) {
        const userData = await userResponse.json()
        setCurrentRMId(userData.user?.managedById || null)
        setSelectedRMId(userData.user?.managedById || null)
      }
      
      // Fetch all RMs for selection
      const rmsResponse = await fetch('/api/admin/rms')
      if (rmsResponse.ok) {
        const rmsData = await rmsResponse.json()
        setRms(rmsData.rms || [])
      }
    } catch (error) {
      console.error("❌ [EDIT-USER-DIALOG] Error loading RM data:", error)
    } finally {
      setLoadingRMs(false)
    }
  }

  const handleAssignRM = async () => {
    if (!user?.id) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/assign-rm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rmId: selectedRMId })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to assign RM")
      }

      toast({
        title: "✅ Success",
        description: selectedRMId ? "RM assigned successfully" : "RM unassigned successfully",
      })

      setCurrentRMId(selectedRMId)
      if (onUserUpdated) {
        onUserUpdated()
      }
    } catch (error: any) {
      console.error("❌ [EDIT-USER-DIALOG] Error assigning RM:", error)
      toast({
        title: "❌ Error",
        description: error.message || "Failed to assign RM",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const loadRiskLimit = async () => {
    if (!user?.id) return
    
    setLoadingRiskLimit(true)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/risk-limit`)
      if (response.ok) {
        const data = await response.json()
        console.log("📊 [EDIT-USER-DIALOG] Risk limit loaded:", data)
        setRiskLimit(data.riskLimit)
        setBaseConfigs(data.baseConfigs || [])
        
        // Calculate multiplier if risk limit exists
        if (data.riskLimit && data.baseConfigs?.length > 0) {
          const avgBaseLeverage = data.baseConfigs.reduce((sum: number, c: any) => sum + c.leverage, 0) / data.baseConfigs.length
          const multiplier = data.riskLimit.maxLeverage / avgBaseLeverage
          setLeverageMultiplier(multiplier)
          console.log("📊 [EDIT-USER-DIALOG] Calculated multiplier:", { avgBaseLeverage, maxLeverage: data.riskLimit.maxLeverage, multiplier })
        }
      }
    } catch (error) {
      console.error("❌ [EDIT-USER-DIALOG] Error loading risk limit:", error)
    } finally {
      setLoadingRiskLimit(false)
    }
  }

  const loadStatementOverride = async () => {
    if (!user?.id) return

    setLoadingStatementOverride(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/statement-override`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to load statement override")
      }

      const mode: StatementOverrideMode =
        data?.mode === "force_enable" || data?.mode === "force_disable" ? data.mode : "default"

      setStatementOverrideMode(mode)
      setOriginalStatementOverrideMode(mode)
      console.log("📄 [EDIT-USER-DIALOG] Statement override loaded", { userId: user.id, mode })
    } catch (e) {
      console.warn("⚠️ [EDIT-USER-DIALOG] Failed to load statement override; defaulting", e)
      setStatementOverrideMode("default")
      setOriginalStatementOverrideMode("default")
    } finally {
      setLoadingStatementOverride(false)
    }
  }

  const saveStatementOverride = async () => {
    if (!user?.id) return

    setSavingStatementOverride(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/statement-override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: statementOverrideMode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to save statement override")
      }

      setOriginalStatementOverrideMode(statementOverrideMode)
      toast({
        title: "✅ Saved",
        description:
          statementOverrideMode === "default"
            ? "Statements override cleared (follows global setting)"
            : `Statements override saved: ${statementOverrideMode}`,
      })
    } catch (e: any) {
      console.error("❌ [EDIT-USER-DIALOG] Failed to save statement override", e)
      toast({
        title: "❌ Error",
        description: e?.message || "Failed to save statement override",
        variant: "destructive",
      })
    } finally {
      setSavingStatementOverride(false)
    }
  }

  const hasChanges = () => {
    if (!originalData) return false
    return JSON.stringify(formData) !== JSON.stringify(originalData)
  }

  const handleSave = async () => {
    if (!hasChanges()) {
      toast({
        title: "No Changes",
        description: "No changes detected",
        variant: "default"
      })
      return
    }

    setLoading(true)
    console.log("💾 [EDIT-USER-DIALOG] Saving user changes:", formData)

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update user")
      }

      const result = await response.json()
      console.log("✅ [EDIT-USER-DIALOG] User updated successfully:", result)

      const u = result?.user
      if (u) {
        const synced = {
          name: u.name ?? "",
          email: u.email ?? "",
          phone: u.phone ?? "",
          role: u.role || "USER",
          isActive: u.isActive !== false,
          clientId: u.clientId ?? "",
          bio: u.bio ?? "",
          requireOtpOnLogin: u.requireOtpOnLogin ?? true,
        }
        setFormData(synced)
        setOriginalData(synced)
      }

      toast({
        title: "✅ Success",
        description: "User profile updated successfully",
      })

      if (onUserUpdated) {
        onUserUpdated()
      }

      onOpenChange(false)
    } catch (error: any) {
      console.error("❌ [EDIT-USER-DIALOG] Error updating user:", error)
      toast({
        title: "❌ Error",
        description: error.message || "Failed to update user",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    const newPassword = prompt("Enter new password (min 6 characters):")
    if (!newPassword || newPassword.length < 6) {
      toast({
        title: "Invalid Password",
        description: "Password must be at least 6 characters",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      })

      if (!response.ok) throw new Error("Failed to reset password")

      toast({
        title: "✅ Password Reset",
        description: "User password has been reset successfully",
      })
    } catch (error: any) {
      toast({
        title: "❌ Error",
        description: error.message || "Failed to reset password",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleResetMPIN = async () => {
    const newMPIN = prompt("Enter new MPIN (4 digits):")
    if (!newMPIN || !/^\d{4}$/.test(newMPIN)) {
      toast({
        title: "Invalid MPIN",
        description: "MPIN must be exactly 4 digits",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/reset-mpin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mpin: newMPIN })
      })

      if (!response.ok) throw new Error("Failed to reset MPIN")

      toast({
        title: "✅ MPIN Reset",
        description: "User MPIN has been reset successfully",
      })
    } catch (error: any) {
      toast({
        title: "❌ Error",
        description: error.message || "Failed to reset MPIN",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveFunds = async () => {
    if (!tradingAccountData) return

    // Validate inputs
    const balance = normalizeEditUserRequiredNonNegativeAmount(tradingAccountData.balance)
    const availableMargin = normalizeEditUserRequiredNonNegativeAmount(tradingAccountData.availableMargin)
    const usedMargin = normalizeEditUserRequiredNonNegativeAmount(tradingAccountData.usedMargin)

    if (balance === null) {
      toast({
        title: "Validation Error",
        description: "Balance must be a non-negative number",
        variant: "destructive"
      })
      return
    }

    if (availableMargin === null) {
      toast({
        title: "Validation Error",
        description: "Available margin must be a non-negative number",
        variant: "destructive"
      })
      return
    }

    if (usedMargin === null) {
      toast({
        title: "Validation Error",
        description: "Used margin must be a non-negative number",
        variant: "destructive"
      })
      return
    }

    // Check if availableMargin + usedMargin makes sense (warn if unusual)
    const totalMargin = availableMargin + usedMargin
    if (totalMargin > balance * 2) {
      const confirmed = confirm(
        `Warning: Total margin (${totalMargin.toLocaleString()}) is significantly higher than balance (${balance.toLocaleString()}). Continue?`
      )
      if (!confirmed) return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/trading-account`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          balance,
          availableMargin,
          usedMargin,
          reason: fundReason || undefined
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update trading account funds")
      }

      const result = await response.json()
      console.log("✅ [EDIT-USER-DIALOG] Trading account funds updated:", result)

      toast({
        title: "✅ Success",
        description: "Trading account funds updated successfully"
      })

      // Reload user data
      if (onUserUpdated) {
        onUserUpdated()
      }

      // Reset form
      setFundReason("")
      if (result.tradingAccount) {
        const newData = {
          balance: String(result.tradingAccount.balance),
          availableMargin: String(result.tradingAccount.availableMargin),
          usedMargin: String(result.tradingAccount.usedMargin)
        }
        setTradingAccountData(newData)
        setOriginalTradingAccountData(newData)
      }
    } catch (error: any) {
      console.error("❌ [EDIT-USER-DIALOG] Error updating funds:", error)
      toast({
        title: "❌ Error",
        description: error.message || "Failed to update trading account funds",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const hasFundChanges = () => {
    if (!tradingAccountData || !originalTradingAccountData) return false
    return (
      tradingAccountData.balance !== originalTradingAccountData.balance ||
      tradingAccountData.availableMargin !== originalTradingAccountData.availableMargin ||
      tradingAccountData.usedMargin !== originalTradingAccountData.usedMargin
    )
  }

  const calculateFundImpact = () => {
    if (!tradingAccountData || !originalTradingAccountData) return null

    const oldBalance = normalizeEditUserAmountForDisplay(originalTradingAccountData.balance)
    const newBalance = normalizeEditUserAmountForDisplay(tradingAccountData.balance)
    const oldAvailableMargin = normalizeEditUserAmountForDisplay(originalTradingAccountData.availableMargin)
    const newAvailableMargin = normalizeEditUserAmountForDisplay(tradingAccountData.availableMargin)
    const oldUsedMargin = normalizeEditUserAmountForDisplay(originalTradingAccountData.usedMargin)
    const newUsedMargin = normalizeEditUserAmountForDisplay(tradingAccountData.usedMargin)

    return {
      balanceDelta: newBalance - oldBalance,
      availableMarginDelta: newAvailableMargin - oldAvailableMargin,
      usedMarginDelta: newUsedMargin - oldUsedMargin,
      totalMarginDelta: (newAvailableMargin + newUsedMargin) - (oldAvailableMargin + oldUsedMargin)
    }
  }

  const handleSaveLeverageOverride = async () => {
    if (leverageMultiplier === null || leverageMultiplier < 0.1) {
      toast({
        title: "Invalid Multiplier",
        description: "Leverage multiplier must be at least 0.1x",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/risk-limit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leverageMultiplier,
          maxDailyLoss: riskLimit?.maxDailyLoss || 0,
          maxPositionSize: riskLimit?.maxPositionSize || 0,
          maxDailyTrades: riskLimit?.maxDailyTrades || 0
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update leverage override")
      }

      const result = await response.json()
      console.log("✅ [EDIT-USER-DIALOG] Leverage override updated:", result)

      toast({
        title: "✅ Success",
        description: `Leverage override set to ${leverageMultiplier}x of base`,
      })

      // Reload risk limit to get updated values
      loadRiskLimit()
    } catch (error: any) {
      console.error("❌ [EDIT-USER-DIALOG] Error updating leverage override:", error)
      toast({
        title: "❌ Error",
        description: error.message || "Failed to update leverage override",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="text-lg sm:text-xl font-bold text-primary">Edit User Profile</DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-muted-foreground">
            Update user information and manage account settings
          </DialogDescription>
        </DialogHeader>

        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* User Info Section */}
          <Card className="bg-muted/30 border-border">
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Full Name
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-background border-border"
                  placeholder="Enter full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-background border-border"
                  placeholder="Enter email address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-foreground flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="bg-background border-border"
                  placeholder="Enter phone number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientId" className="text-foreground flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Client ID
                </Label>
                <Input
                  id="clientId"
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="bg-background border-border font-mono"
                  placeholder="Enter client ID"
                />
              </div>

              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <Label className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                  Referred by
                </Label>
                {referredByUser ? (
                  <p className="text-sm font-medium">
                    {referredByUser.clientId ?? referredByUser.id.slice(0, 8)}
                    {referredByUser.name ? ` · ${referredByUser.name}` : ""}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">— No referral attribution</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="role" className="text-foreground">Role</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(value) => {
                      // Security check: Only holders of admin.all (Super Admin) can assign ADMIN/SUPER_ADMIN roles
                      if ((value === 'ADMIN' || value === 'SUPER_ADMIN') && !canAssignHighRoles) {
                        toast({
                          title: "⚠️ Security Restriction",
                          description: "Only Super Admins can assign Admin or Super Admin roles",
                          variant: "destructive"
                        })
                        return
                      }
                      setFormData({ ...formData, role: value })
                    }}
                    disabled={!canAssignHighRoles && (formData.role === 'ADMIN' || formData.role === 'SUPER_ADMIN')}
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER">User</SelectItem>
                      <SelectItem value="MODERATOR">Moderator</SelectItem>
                      {/* Only Super Admins (admin.all) can see/assign ADMIN and SUPER_ADMIN roles */}
                      {canAssignHighRoles ? (
                        <>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                        </>
                      ) : (
                        <>
                          {/* Show current role if it's ADMIN/SUPER_ADMIN but disable editing */}
                          {formData.role === 'ADMIN' && (
                            <SelectItem value="ADMIN" disabled>Admin (Super Admin Only)</SelectItem>
                          )}
                          {formData.role === 'SUPER_ADMIN' && (
                            <SelectItem value="SUPER_ADMIN" disabled>Super Admin (Super Admin Only)</SelectItem>
                          )}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  {!canAssignHighRoles && (formData.role === 'ADMIN' || formData.role === 'SUPER_ADMIN') && (
                    <p className="text-xs text-yellow-500/80 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Only Super Admins can modify admin roles
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status" className="text-foreground">Account</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Active = can log in (if not suspended). Deactivated = admin-disabled account. Suspension is separate — use Quick Actions → Freeze/Unfreeze.
                  </p>
                  {(user as { suspendedAt?: string | Date | null })?.suspendedAt ? (
                    <Alert className="border-amber-500/50 bg-amber-500/10">
                      <AlertTitle className="text-amber-700 dark:text-amber-400 text-sm">Suspended</AlertTitle>
                      <AlertDescription className="text-xs text-muted-foreground">
                        This user is frozen (cannot log in). Unfreeze from the user row → Quick Actions.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <Select 
                    value={formData.isActive ? "active" : "inactive"} 
                    onValueChange={(value) => setFormData({ ...formData, isActive: value === "active" })}
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active (account enabled)</SelectItem>
                      <SelectItem value="inactive">Deactivated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <Label className="text-foreground font-medium">Require OTP on login</Label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Same setting as the user&apos;s Security page. When off, the user can sign in without an OTP step
                  (mobile and other flows that respect this flag). Turning off reduces account security. Does not sign
                  the user out of existing sessions.
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">
                    {securityOtpHydrated
                      ? formData.requireOtpOnLogin
                        ? "OTP required on each login"
                        : "OTP not required"
                      : "Loading preference…"}
                  </span>
                  <Switch
                    id="admin-require-otp-login"
                    checked={formData.requireOtpOnLogin}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, requireOtpOnLogin: checked }))
                    }
                    disabled={loading || !securityOtpHydrated}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio" className="text-foreground">Bio</Label>
                <Input
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="bg-background border-border"
                  placeholder="Enter bio (optional)"
                />
              </div>
            </CardContent>
          </Card>

          {/* Linked bank accounts (read-only; user-managed in console) */}
          <Card className="bg-muted/30 border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Linked bank accounts</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Withdrawal beneficiaries the user registered in the client console (distinct from KYC bank proof).
              </p>
              {loadingLinkedBanks ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading bank accounts…
                </div>
              ) : linkedBankAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bank accounts linked yet.</p>
              ) : (
                <ul className="space-y-3">
                  {linkedBankAccounts.map((acc) => (
                    <li
                      key={acc.id}
                      className="rounded-lg border border-border bg-background/50 p-3 text-sm space-y-1"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{acc.bankName}</span>
                        {acc.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                        <Badge variant={acc.isActive ? "outline" : "destructive"} className="text-xs">
                          {acc.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>
                          Account:{" "}
                          <span className="font-mono text-foreground">
                            {canRevealSensitiveBank
                              ? formatAdminFullAccountForDisplay(acc.accountNumber)
                              : formatAdminBankAccountSummary(acc.bankName, acc.accountNumber)}
                          </span>
                        </p>
                        <p>
                          IFSC:{" "}
                          <span className="font-mono text-foreground">
                            {canRevealSensitiveBank
                              ? String(acc.ifscCode || "—").toUpperCase()
                              : formatAdminMaskedIfsc(acc.ifscCode)}
                          </span>
                        </p>
                        <p>Holder: {acc.accountHolderName || "—"}</p>
                        <p className="capitalize">Type: {acc.accountType || "—"}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!canRevealSensitiveBank && linkedBankAccounts.length > 0 && (
                <p className="text-xs text-amber-600">
                  Full account number and IFSC require <code className="text-xs">admin.users.bank.sensitive</code> or{" "}
                  <code className="text-xs">admin.all</code>.
                </p>
              )}
            </CardContent>
          </Card>

          {/* RM Assignment Section */}
          {canAssignRms && (
            <Card className="bg-muted/30 border-border">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Relationship Manager Assignment</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Assign a Relationship Manager to provide personalized support to this user
                </p>

                {loadingRMs ? (
                  <div className="text-center py-4 text-muted-foreground">Loading RMs...</div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="rm" className="text-foreground">Select RM</Label>
                      <Select 
                        value={selectedRMId || "none"} 
                        onValueChange={(value) => setSelectedRMId(value === "none" ? null : value)}
                      >
                        <SelectTrigger className="bg-background border-border">
                          <SelectValue placeholder="Select RM" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No RM (Unassign)</SelectItem>
                          {rms.map((rm) => (
                            <SelectItem key={rm.id} value={rm.id}>
                              {rm.name || rm.email || rm.id.slice(0, 8)} 
                              {rm.role && ` (${rm.role === 'ADMIN' ? 'Admin' : rm.role === 'MODERATOR' ? 'Moderator' : rm.role})`}
                              {rm.assignedUsersCount > 0 && ` - ${rm.assignedUsersCount} users`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {currentRMId && (
                        <p className="text-xs text-muted-foreground">
                          Current RM: {rms.find(r => r.id === currentRMId)?.name || "N/A"}
                        </p>
                      )}
                    </div>

                    {selectedRMId !== currentRMId && (
                      <Button
                        onClick={handleAssignRM}
                        disabled={loading}
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                      >
                        {loading ? (
                          <>
                            <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-4 h-4 mr-2" />
                            {selectedRMId ? "Assign RM" : "Unassign RM"}
                          </>
                        )}
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Statements Visibility Override (tri-state) */}
          <Card className="bg-muted/30 border-border">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Statements Visibility</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Override whether this user can access statements, independent of the app-wide setting.
              </p>

              {loadingStatementOverride ? (
                <div className="text-center py-3 text-muted-foreground">Loading statement override...</div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-foreground">Override Mode</Label>
                    <Select value={statementOverrideMode} onValueChange={(v) => setStatementOverrideMode(v as StatementOverrideMode)}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default (follow global)</SelectItem>
                        <SelectItem value="force_enable">Force Enable</SelectItem>
                        <SelectItem value="force_disable">Force Disable</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Tip: Use Force Disable for compliance / restricted accounts.
                    </p>
                  </div>

                  {statementOverrideMode !== originalStatementOverrideMode && (
                    <Button
                      onClick={saveStatementOverride}
                      disabled={savingStatementOverride}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {savingStatementOverride ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Statements Override
                        </>
                      )}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Leverage Override Section */}
          <Card className="bg-muted/30 border-border">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Leverage Override</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Override user leverage as a multiplier of platform-wide base leverage
              </p>

              {loadingRiskLimit ? (
                <div className="text-center py-4 text-muted-foreground">Loading risk settings...</div>
              ) : (
                <>
                  {/* Base Leverage Info */}
                  {baseConfigs.length > 0 && (
                    <div className="bg-background/50 p-3 rounded-lg border border-border mb-4">
                      <p className="text-xs text-muted-foreground mb-2">Platform Base Leverage (by segment):</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {baseConfigs.slice(0, 4).map((config, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span className="text-muted-foreground">{config.segment}/{config.productType}:</span>
                            <span className="font-medium text-foreground">{config.leverage}x</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Leverage Multiplier Input */}
                  <div className="space-y-2">
                    <Label htmlFor="leverageMultiplier" className="text-foreground">
                      Leverage Multiplier (x base)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="leverageMultiplier"
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="10"
                        value={leverageMultiplier !== null ? leverageMultiplier : ''}
                        onChange={(e) => {
                          const value = normalizeEditUserLeverageMultiplierInput(e.target.value)
                          setLeverageMultiplier(value)
                        }}
                        className="bg-background border-border"
                        placeholder="e.g., 1.5 for 1.5x base"
                      />
                      <span className="text-sm text-muted-foreground">x</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {leverageMultiplier !== null && baseConfigs.length > 0 ? (
                        <>
                          Effective leverage: <span className="font-medium text-foreground">
                            {(baseConfigs.reduce((sum, c) => sum + c.leverage, 0) / baseConfigs.length * leverageMultiplier).toFixed(1)}x
                          </span>
                        </>
                      ) : (
                        "Set multiplier to override user leverage"
                      )}
                    </p>
                  </div>

                  {/* Current Override Display */}
                  {riskLimit && (
                    <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/30">
                      <p className="text-xs text-muted-foreground mb-1">Current Override:</p>
                      <p className="text-sm font-medium text-foreground">
                        Max Leverage: {riskLimit.maxLeverage}x
                      </p>
                    </div>
                  )}

                  {/* Save Button */}
                  <Button
                    onClick={handleSaveLeverageOverride}
                    disabled={loading || leverageMultiplier === null}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Leverage Override
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Trading Account Funds Management (Permission-gated) */}
          {canOverrideFunds && tradingAccountData && (
            <Card className="bg-yellow-500/10 border-yellow-500/50">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-yellow-400" />
                  <h3 className="font-semibold text-foreground">Trading Account Funds</h3>
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Restricted</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  ⚠️ <strong>Warning:</strong> Direct fund manipulation. Changes will create transaction records and affect user's trading capabilities.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="balance" className="text-foreground flex items-center gap-2">
                      <Wallet className="w-4 h-4" />
                      Balance (₹)
                    </Label>
                    <Input
                      id="balance"
                      type="number"
                      step="0.01"
                      min="0"
                      value={tradingAccountData.balance}
                      onChange={(e) => setTradingAccountData({ ...tradingAccountData, balance: e.target.value })}
                      className="bg-background border-border font-mono"
                      placeholder="0.00"
                    />
                    {originalTradingAccountData && (
                      <p className="text-xs text-muted-foreground">
                        Current: ₹{normalizeEditUserAmountForDisplay(originalTradingAccountData.balance).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="availableMargin" className="text-foreground flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Available Margin (₹)
                    </Label>
                    <Input
                      id="availableMargin"
                      type="number"
                      step="0.01"
                      min="0"
                      value={tradingAccountData.availableMargin}
                      onChange={(e) => setTradingAccountData({ ...tradingAccountData, availableMargin: e.target.value })}
                      className="bg-background border-border font-mono"
                      placeholder="0.00"
                    />
                    {originalTradingAccountData && (
                      <p className="text-xs text-muted-foreground">
                        Current: ₹{normalizeEditUserAmountForDisplay(originalTradingAccountData.availableMargin).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="usedMargin" className="text-foreground flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Used Margin (₹)
                    </Label>
                    <Input
                      id="usedMargin"
                      type="number"
                      step="0.01"
                      min="0"
                      value={tradingAccountData.usedMargin}
                      onChange={(e) => setTradingAccountData({ ...tradingAccountData, usedMargin: e.target.value })}
                      className="bg-background border-border font-mono"
                      placeholder="0.00"
                    />
                    {originalTradingAccountData && (
                      <p className="text-xs text-muted-foreground">
                        Current: ₹{normalizeEditUserAmountForDisplay(originalTradingAccountData.usedMargin).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                {/* Fund Impact Warning */}
                {hasFundChanges() && (() => {
                  const impact = calculateFundImpact()
                  if (!impact) return null
                  
                  return (
                    <Alert className={impact.balanceDelta >= 0 ? "bg-green-500/10 border-green-500/50" : "bg-red-500/10 border-red-500/50"}>
                      <DollarSign className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-1">
                          {impact.balanceDelta !== 0 && (
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Balance Change:</span>
                              <span className={impact.balanceDelta >= 0 ? "text-green-400" : "text-red-400"}>
                                {impact.balanceDelta >= 0 ? "+" : ""}₹{Math.abs(impact.balanceDelta).toLocaleString()}
                              </span>
                            </div>
                          )}
                          {impact.availableMarginDelta !== 0 && (
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Available Margin Change:</span>
                              <span className={impact.availableMarginDelta >= 0 ? "text-green-400" : "text-red-400"}>
                                {impact.availableMarginDelta >= 0 ? "+" : ""}₹{Math.abs(impact.availableMarginDelta).toLocaleString()}
                              </span>
                            </div>
                          )}
                          {impact.usedMarginDelta !== 0 && (
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Used Margin Change:</span>
                              <span className={impact.usedMarginDelta >= 0 ? "text-red-400" : "text-green-400"}>
                                {impact.usedMarginDelta >= 0 ? "+" : ""}₹{Math.abs(impact.usedMarginDelta).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )
                })()}

                {/* Reason for change */}
                <div className="space-y-2">
                  <Label htmlFor="fundReason" className="text-foreground">Reason for Change (Optional)</Label>
                  <Input
                    id="fundReason"
                    value={fundReason}
                    onChange={(e) => setFundReason(e.target.value)}
                    className="bg-background border-border"
                    placeholder="e.g., Manual adjustment, reconciliation, etc."
                    maxLength={200}
                  />
                  <p className="text-xs text-muted-foreground">
                    This reason will be recorded in the transaction history
                  </p>
                </div>

                {/* Save Funds Button */}
                <Button
                  onClick={handleSaveFunds}
                  disabled={loading || !hasFundChanges()}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving Funds...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4 mr-2" />
                      Save Fund Changes
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {canReadSessions ? (
            <Card className="bg-muted/30 border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-5 h-5 text-primary" />
                    <div>
                      <h3 className="font-semibold text-foreground">Active sign-ins &amp; devices</h3>
                      <p className="text-xs text-muted-foreground">
                        Same registry as Session Security. Times in IST (Asia/Kolkata).
                      </p>
                    </div>
                  </div>
                  {canManageSessions &&
                  userSessions.some((s) => !s.revokedAt && s.jti) ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => void revokeAllActiveSessionsForUser()}>
                      Sign out all devices
                    </Button>
                  ) : null}
                </div>
                {loadingUserSessions ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading sessions…
                  </div>
                ) : userSessions.filter((s) => !s.revokedAt).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No active device sessions in the registry.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto rounded-md border border-border/60">
                    {userSessions
                      .filter((s) => !s.revokedAt)
                      .map((s) => (
                        <div
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-3 py-2 last:border-0"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{sessionKindLabel(s.kind)}</div>
                            <div className="text-xs text-muted-foreground font-mono" title={s.networkKey ?? ""}>
                              Net: {truncateNetworkKey(s.networkKey, 20)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Last seen (IST): {formatSessionSeenIST(s.lastSeenAt)}
                            </div>
                          </div>
                          {canManageSessions && s.jti ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => setSessionRevokeTarget({ jti: s.jti as string })}
                            >
                              Revoke
                            </Button>
                          ) : null}
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* Credential Management */}
          <Card className="bg-muted/30 border-border">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-foreground mb-3">Credential Management</h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Password</p>
                  <p className="text-xs text-muted-foreground">Reset user password</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetPassword}
                  disabled={loading}
                  className="border-primary/50 text-primary hover:bg-primary/10"
                >
                  <Key className="w-4 h-4 mr-2" />
                  Reset Password
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">MPIN</p>
                  <p className="text-xs text-muted-foreground">Reset trading MPIN</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetMPIN}
                  disabled={loading}
                  className="border-primary/50 text-primary hover:bg-primary/10"
                >
                  <Key className="w-4 h-4 mr-2" />
                  Reset MPIN
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Changes Indicator */}
          {hasChanges() && (
            <Alert className="bg-yellow-500/10 border-yellow-500/50">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-500/80">
                You have unsaved changes
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="border-border"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || !hasChanges()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(sessionRevokeTarget)} onOpenChange={(o) => !o && setSessionRevokeTarget(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke this session?</DialogTitle>
          <DialogDescription>The user will be signed out on that device.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Select value={sessionRevokeReason} onValueChange={setSessionRevokeReason}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REVOKE_REASON_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setSessionRevokeTarget(null)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={() => void confirmRevokeUserSession()}>
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
