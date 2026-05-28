/**
 * @file user-quick-actions.tsx
 * @module admin-console
 * @description User quick actions menu for admin operations (security, RM, risk)
 * @author StockTrade
 * @created 2026-01-15
 */

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { KeyRound, Lock, MoreHorizontal, ShieldCheck, ShieldOff, UserCog, AlertTriangle } from "lucide-react"
import { parseUserQuickActionNumericInput } from "@/components/admin-console/user-quick-actions-number-utils"

type QuickAction =
  | "reset-password"
  | "reset-mpin"
  | "freeze"
  | "verify-contact"
  | "assign-rm"
  | "risk-limit"

type AdminUserRow = {
  id: string
  name?: string
  email?: string
  phone?: string
  clientId?: string
  status?: string
  /** ISO string when suspended; freeze/unfreeze uses this, not `status`. */
  suspendedAt?: string | null
}

type UserQuickActionsProps = {
  user: AdminUserRow
  onActionCompleted: () => void
  disabled?: boolean
  disabledReason?: string
}

const getIstTimestamp = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })

const getResponseErrorMessage = async (response: Response, fallback: string) => {
  const data = await response.json().catch(() => null)
  return data?.error || data?.message || fallback
}

export function UserQuickActions({
  user,
  onActionCompleted,
  disabled = false,
  disabledReason = "Switch to live data to run admin actions",
}: UserQuickActionsProps) {
  const [activeAction, setActiveAction] = useState<QuickAction | null>(null)

  const closeDialog = () => setActiveAction(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="text-xs" disabled={disabled} title={disabledReason}>
            <MoreHorizontal className="w-3 h-3 mr-1" />
            Quick Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Security</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setActiveAction("reset-password")}>
            <KeyRound className="w-4 h-4 mr-2" />
            Reset Password
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setActiveAction("reset-mpin")}>
            <Lock className="w-4 h-4 mr-2" />
            Reset MPIN
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setActiveAction("freeze")}>
            {user.suspendedAt ? (
              <>
                <ShieldCheck className="w-4 h-4 mr-2" />
                Unfreeze Account
              </>
            ) : (
              <>
                <ShieldOff className="w-4 h-4 mr-2" />
                Freeze Account
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setActiveAction("verify-contact")}>
            <ShieldCheck className="w-4 h-4 mr-2" />
            Verify Contact
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Management</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setActiveAction("assign-rm")}>
            <UserCog className="w-4 h-4 mr-2" />
            Assign RM
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setActiveAction("risk-limit")}>
            <AlertTriangle className="w-4 h-4 mr-2" />
            Risk Limits
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResetPasswordDialog
        user={user}
        open={activeAction === "reset-password"}
        onOpenChange={(open) => (!open ? closeDialog() : null)}
        onCompleted={() => {
          closeDialog()
          onActionCompleted()
        }}
      />
      <ResetMpinDialog
        user={user}
        open={activeAction === "reset-mpin"}
        onOpenChange={(open) => (!open ? closeDialog() : null)}
        onCompleted={() => {
          closeDialog()
          onActionCompleted()
        }}
      />
      <FreezeAccountDialog
        user={user}
        open={activeAction === "freeze"}
        onOpenChange={(open) => (!open ? closeDialog() : null)}
        onCompleted={() => {
          closeDialog()
          onActionCompleted()
        }}
      />
      <VerifyContactDialog
        user={user}
        open={activeAction === "verify-contact"}
        onOpenChange={(open) => (!open ? closeDialog() : null)}
        onCompleted={() => {
          closeDialog()
          onActionCompleted()
        }}
      />
      <AssignRmDialog
        user={user}
        open={activeAction === "assign-rm"}
        onOpenChange={(open) => (!open ? closeDialog() : null)}
        onCompleted={() => {
          closeDialog()
          onActionCompleted()
        }}
      />
      <RiskLimitDialog
        user={user}
        open={activeAction === "risk-limit"}
        onOpenChange={(open) => (!open ? closeDialog() : null)}
        onCompleted={() => {
          closeDialog()
          onActionCompleted()
        }}
      />
    </>
  )
}

type ActionDialogProps = {
  user: AdminUserRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}

function ResetPasswordDialog({ user, open, onOpenChange, onCompleted }: ActionDialogProps) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPassword("")
      setConfirmPassword("")
      setError(null)
    }
  }, [open])

  const handleSubmit = async () => {
    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)
    setError(null)
    console.log(`[ADMIN][RESET-PASSWORD] ${getIstTimestamp()} Resetting password for`, user.id)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, "Failed to reset password"))
      }

      toast({ title: "Password reset", description: "User password updated successfully" })
      onCompleted()
    } catch (err: any) {
      console.error("[ADMIN][RESET-PASSWORD] Failed", err)
      setError(err?.message || "Failed to reset password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Set a new password for {user.name || user.email || user.clientId || "this user"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Confirm Password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Reset failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? "Saving..." : "Reset Password"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ResetMpinDialog({ user, open, onOpenChange, onCompleted }: ActionDialogProps) {
  const [mpin, setMpin] = useState("")
  const [confirmMpin, setConfirmMpin] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setMpin("")
      setConfirmMpin("")
      setError(null)
    }
  }, [open])

  const handleSubmit = async () => {
    if (!/^\d{4}$/.test(mpin)) {
      setError("MPIN must be exactly 4 digits")
      return
    }
    if (mpin !== confirmMpin) {
      setError("MPIN values do not match")
      return
    }

    setLoading(true)
    setError(null)
    console.log(`[ADMIN][RESET-MPIN] ${getIstTimestamp()} Resetting MPIN for`, user.id)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/reset-mpin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mpin }),
      })

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, "Failed to reset MPIN"))
      }

      toast({ title: "MPIN reset", description: "User MPIN updated successfully" })
      onCompleted()
    } catch (err: any) {
      console.error("[ADMIN][RESET-MPIN] Failed", err)
      setError(err?.message || "Failed to reset MPIN")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset MPIN</DialogTitle>
          <DialogDescription>
            Update the 4-digit MPIN for {user.name || user.email || user.clientId || "this user"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>New MPIN</Label>
            <Input
              value={mpin}
              inputMode="numeric"
              maxLength={4}
              onChange={(e) => setMpin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-2">
            <Label>Confirm MPIN</Label>
            <Input
              value={confirmMpin}
              inputMode="numeric"
              maxLength={4}
              onChange={(e) => setConfirmMpin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Reset failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? "Saving..." : "Reset MPIN"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FreezeAccountDialog({ user, open, onOpenChange, onCompleted }: ActionDialogProps) {
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shouldFreeze = !user.suspendedAt
  const actionLabel = shouldFreeze ? "Freeze" : "Unfreeze"

  useEffect(() => {
    if (open) {
      setReason("")
      setError(null)
    }
  }, [open])

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    console.log(`[ADMIN][FREEZE] ${getIstTimestamp()} ${actionLabel} account for`, user.id)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeze: shouldFreeze, reason: reason || undefined }),
      })

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, `Failed to ${actionLabel.toLowerCase()} account`))
      }

      toast({ title: `${actionLabel}d account`, description: `User account ${actionLabel.toLowerCase()}d.` })
      onCompleted()
    } catch (err: any) {
      console.error("[ADMIN][FREEZE] Failed", err)
      setError(err?.message || `Failed to ${actionLabel.toLowerCase()} account`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{actionLabel} Account</DialogTitle>
          <DialogDescription>
            {actionLabel} access for {user.name || user.email || user.clientId || "this user"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Action failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? "Saving..." : `${actionLabel} Account`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function VerifyContactDialog({ user, open, onOpenChange, onCompleted }: ActionDialogProps) {
  const [contactType, setContactType] = useState<"email" | "phone">("email")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasEmail = Boolean(user.email)
  const hasPhone = Boolean(user.phone)

  useEffect(() => {
    if (open) {
      setError(null)
      if (hasEmail) setContactType("email")
      else if (hasPhone) setContactType("phone")
    }
  }, [open, hasEmail, hasPhone])

  const handleSubmit = async () => {
    if (contactType === "email" && !hasEmail) {
      setError("User does not have an email address")
      return
    }
    if (contactType === "phone" && !hasPhone) {
      setError("User does not have a phone number")
      return
    }

    setLoading(true)
    setError(null)
    console.log(`[ADMIN][VERIFY-CONTACT] ${getIstTimestamp()} Verifying ${contactType} for`, user.id)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/verify-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: contactType }),
      })

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, "Failed to verify contact"))
      }

      toast({ title: "Contact verified", description: `${contactType.toUpperCase()} marked as verified.` })
      onCompleted()
    } catch (err: any) {
      console.error("[ADMIN][VERIFY-CONTACT] Failed", err)
      setError(err?.message || "Failed to verify contact")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Verify Contact</DialogTitle>
          <DialogDescription>Manually verify email or phone for this user.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Contact Type</Label>
            <Select value={contactType} onValueChange={(value) => setContactType(value as "email" | "phone")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email" disabled={!hasEmail}>
                  Email {hasEmail ? `(${user.email})` : "(not available)"}
                </SelectItem>
                <SelectItem value="phone" disabled={!hasPhone}>
                  Phone {hasPhone ? `(${user.phone})` : "(not available)"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Verification failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? "Saving..." : "Verify Contact"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type RmOption = {
  id: string
  name?: string | null
  email?: string | null
  role?: string
}

function AssignRmDialog({ user, open, onOpenChange, onCompleted }: ActionDialogProps) {
  const UNASSIGNED_VALUE = "__UNASSIGNED__"
  const [rmOptions, setRmOptions] = useState<RmOption[]>([])
  const [selectedRmId, setSelectedRmId] = useState(UNASSIGNED_VALUE)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadOptions = useCallback(async () => {
    setLoading(true)
    setError(null)
    console.log(`[ADMIN][ASSIGN-RM] ${getIstTimestamp()} Loading RM list for`, user.id)
    try {
      const [rmsResponse, userResponse] = await Promise.all([
        fetch("/api/admin/rms"),
        fetch(`/api/admin/users/${user.id}`),
      ])

      if (!rmsResponse.ok) {
        throw new Error(await getResponseErrorMessage(rmsResponse, "Failed to load RM list"))
      }
      if (!userResponse.ok) {
        throw new Error(await getResponseErrorMessage(userResponse, "Failed to load user details"))
      }

      const rmsData = await rmsResponse.json()
      const userData = await userResponse.json()
      const managedById = userData?.user?.managedById || ""

      setRmOptions(
        (rmsData?.rms || []).filter((rm: RmOption) => rm.role === "ADMIN" || rm.role === "MODERATOR")
      )
      setSelectedRmId(managedById || UNASSIGNED_VALUE)
    } catch (err: any) {
      console.error("[ADMIN][ASSIGN-RM] Load failed", err)
      setError(err?.message || "Failed to load RMs")
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    if (open) {
      loadOptions()
    }
  }, [open, loadOptions])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    console.log(`[ADMIN][ASSIGN-RM] ${getIstTimestamp()} Assigning RM`, {
      userId: user.id,
      rmId: selectedRmId === UNASSIGNED_VALUE ? null : selectedRmId,
    })
    try {
      const response = await fetch(`/api/admin/users/${user.id}/assign-rm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rmId: selectedRmId === UNASSIGNED_VALUE ? null : selectedRmId }),
      })

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, "Failed to assign RM"))
      }

      toast({ title: "RM updated", description: "Relationship manager assignment saved." })
      onCompleted()
    } catch (err: any) {
      console.error("[ADMIN][ASSIGN-RM] Save failed", err)
      setError(err?.message || "Failed to assign RM")
    } finally {
      setSaving(false)
    }
  }

  const emptyState = !loading && rmOptions.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Relationship Manager</DialogTitle>
          <DialogDescription>
            Assign or unassign an RM for {user.name || user.email || user.clientId || "this user"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {emptyState && (
            <Alert className="bg-yellow-500/10 border-yellow-500/50">
              <AlertTitle>No RM options available</AlertTitle>
              <AlertDescription>There are no Admin or Moderator accounts available to assign.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>Select RM</Label>
            <Select value={selectedRmId} onValueChange={setSelectedRmId} disabled={loading || emptyState}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Loading..." : "Select an RM"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                {rmOptions.map((rm) => (
                  <SelectItem key={rm.id} value={rm.id}>
                    {rm.name || rm.email || rm.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Assignment failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={handleSave} disabled={saving || loading || emptyState} className="w-full">
            {saving ? "Saving..." : "Save Assignment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type BaseConfig = {
  segment: string
  productType: string
  leverage: number
}

type RiskLimitFormState = {
  maxDailyLoss: string
  maxPositionSize: string
  maxLeverage: string
  maxDailyTrades: string
  leverageMultiplier: string
}

function RiskLimitDialog({ user, open, onOpenChange, onCompleted }: ActionDialogProps) {
  const [form, setForm] = useState<RiskLimitFormState>({
    maxDailyLoss: "",
    maxPositionSize: "",
    maxLeverage: "",
    maxDailyTrades: "",
    leverageMultiplier: "",
  })
  const [baseConfigs, setBaseConfigs] = useState<BaseConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRiskLimit = useCallback(async () => {
    setLoading(true)
    setError(null)
    console.log(`[ADMIN][RISK-LIMIT] ${getIstTimestamp()} Loading risk limit for`, user.id)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/risk-limit`)
      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, "Failed to load risk limits"))
      }

      const data = await response.json()
      const riskLimit = data?.riskLimit
      setBaseConfigs(data?.baseConfigs || [])
      setForm({
        maxDailyLoss: riskLimit?.maxDailyLoss?.toString() || "",
        maxPositionSize: riskLimit?.maxPositionSize?.toString() || "",
        maxLeverage: riskLimit?.maxLeverage?.toString() || "",
        maxDailyTrades: riskLimit?.maxDailyTrades?.toString() || "",
        leverageMultiplier: "",
      })
    } catch (err: any) {
      console.error("[ADMIN][RISK-LIMIT] Load failed", err)
      setError(err?.message || "Failed to load risk limits")
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    if (open) {
      loadRiskLimit()
    }
  }, [open, loadRiskLimit])

  const handleSave = async () => {
    const maxDailyLoss = parseUserQuickActionNumericInput(form.maxDailyLoss)
    const maxPositionSize = parseUserQuickActionNumericInput(form.maxPositionSize)
    const maxLeverage = parseUserQuickActionNumericInput(form.maxLeverage)
    const maxDailyTrades = parseUserQuickActionNumericInput(form.maxDailyTrades)
    const leverageMultiplier = parseUserQuickActionNumericInput(form.leverageMultiplier)

    if (Number.isNaN(maxDailyLoss)) return setError("Max daily loss must be a valid number")
    if (Number.isNaN(maxPositionSize)) return setError("Max position size must be a valid number")
    if (Number.isNaN(maxLeverage)) return setError("Max leverage must be a valid number")
    if (Number.isNaN(maxDailyTrades)) return setError("Max daily trades must be a valid number")
    if (Number.isNaN(leverageMultiplier)) return setError("Leverage multiplier must be a valid number")

    if (maxDailyLoss !== null && maxDailyLoss < 0) return setError("Max daily loss must be non-negative")
    if (maxPositionSize !== null && maxPositionSize < 0) return setError("Max position size must be non-negative")
    if (maxLeverage !== null && maxLeverage < 0) return setError("Max leverage must be non-negative")
    if (maxDailyTrades !== null && maxDailyTrades < 0) return setError("Max daily trades must be non-negative")
    if (maxDailyTrades !== null && !Number.isInteger(maxDailyTrades)) {
      return setError("Max daily trades must be an integer")
    }
    if (leverageMultiplier !== null && leverageMultiplier < 0) {
      return setError("Leverage multiplier must be non-negative")
    }

    const payload: Record<string, number> = {}
    if (maxDailyLoss !== null) payload.maxDailyLoss = maxDailyLoss
    if (maxPositionSize !== null) payload.maxPositionSize = maxPositionSize
    if (maxDailyTrades !== null) payload.maxDailyTrades = maxDailyTrades

    // Prefer multiplier when provided to avoid conflicting leverage updates.
    if (leverageMultiplier !== null) payload.leverageMultiplier = leverageMultiplier
    else if (maxLeverage !== null) payload.maxLeverage = maxLeverage

    setSaving(true)
    setError(null)
    console.log(`[ADMIN][RISK-LIMIT] ${getIstTimestamp()} Saving risk limits`, { userId: user.id, payload })
    try {
      const response = await fetch(`/api/admin/users/${user.id}/risk-limit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, "Failed to update risk limits"))
      }

      toast({ title: "Risk limits updated", description: "User risk limits saved successfully." })
      onCompleted()
    } catch (err: any) {
      console.error("[ADMIN][RISK-LIMIT] Save failed", err)
      setError(err?.message || "Failed to update risk limits")
    } finally {
      setSaving(false)
    }
  }

  const baseConfigLabel = useMemo(() => {
    if (!baseConfigs.length) return "No base leverage configs available."
    return baseConfigs.map((config) => `${config.segment}/${config.productType}: ${config.leverage}x`).join(" | ")
  }, [baseConfigs])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Risk Limits</DialogTitle>
          <DialogDescription>
            Update risk limits for {user.name || user.email || user.clientId || "this user"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Alert className="bg-muted/40 border-border">
            <AlertTitle>Base leverage reference</AlertTitle>
            <AlertDescription>{baseConfigLabel}</AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Daily Loss (₹)</Label>
              <Input value={form.maxDailyLoss} onChange={(e) => setForm({ ...form, maxDailyLoss: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Max Position Size (₹)</Label>
              <Input value={form.maxPositionSize} onChange={(e) => setForm({ ...form, maxPositionSize: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Max Leverage</Label>
              <Input value={form.maxLeverage} onChange={(e) => setForm({ ...form, maxLeverage: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Max Daily Trades</Label>
              <Input value={form.maxDailyTrades} onChange={(e) => setForm({ ...form, maxDailyTrades: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Leverage Multiplier (Optional)</Label>
              <Input
                value={form.leverageMultiplier}
                onChange={(e) => setForm({ ...form, leverageMultiplier: e.target.value })}
                placeholder="Overrides max leverage when set"
              />
            </div>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Update failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={handleSave} disabled={saving || loading} className="w-full">
            {saving ? "Saving..." : "Save Risk Limits"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
