"use client"

/**
 * @file security-section.tsx
 * @module components/console/sections
 * @description Security workspace section for OTP requirements, MPIN controls, and safety guidance.
 * @author StockTrade
 * @created 2026-02-16
 */

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Shield, Lock, Smartphone, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { ChangeMPINDialog } from "../dialogs/change-mpin-dialog"
import { useSession } from "next-auth/react"
import { useConsoleData } from "@/lib/hooks/use-console-data"

export function SecuritySection() {
  const [requireOtpOnLogin, setRequireOtpOnLogin] = useState(true)
  const [isUpdatingOtpSetting, setIsUpdatingOtpSetting] = useState(false)
  const [showMPINDialog, setShowMPINDialog] = useState(false)
  const { toast } = useToast()

  // Read session details and console data
  const { data: session } = useSession()
  const userId = (session?.user as any)?.id as string | undefined
  const { consoleData, isLoading, error, refetch } = useConsoleData(userId)

  // Load user's OTP preference from console data
  useEffect(() => {
    if (consoleData?.user?.requireOtpOnLogin !== undefined) {
      console.log("SecuritySection: Loading OTP preference", consoleData.user.requireOtpOnLogin)
      setRequireOtpOnLogin(consoleData.user.requireOtpOnLogin)
    }
  }, [consoleData])

  const handleToggleOtpRequirement = async (checked: boolean) => {
    if (!userId) {
      toast({
        title: "Error",
        description: "User session not found. Please log in again.",
        variant: "destructive",
      })
      return
    }

    setIsUpdatingOtpSetting(true)
    console.log("SecuritySection: Toggling OTP requirement to", checked)

    try {
      const response = await fetch("/api/console/security/otp-setting", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requireOtpOnLogin: checked,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to update OTP setting")
      }

      setRequireOtpOnLogin(checked)
      toast({
        title: checked ? "OTP Required" : "OTP Disabled",
        description: checked
          ? "You will be asked for OTP every time you log in."
          : "You can log in without OTP verification. This reduces security.",
        variant: checked ? "default" : "destructive",
      })

      // Refetch console data to sync state
      await refetch()
    } catch (error) {
      console.error("SecuritySection: Failed to update OTP setting", error)
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update OTP setting. Please try again.",
        variant: "destructive",
      })
      // Revert the toggle on error
      setRequireOtpOnLogin(!checked)
    } finally {
      setIsUpdatingOtpSetting(false)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading security settings...
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
          <div className="text-xl font-semibold text-destructive">Error loading security settings</div>
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
      {/* Header */}
      <div className="space-y-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Security Settings
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage your account security preferences and authentication settings
          </p>
        </div>
      </div>

      {/* Login Security Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Login Security
          </CardTitle>
          <CardDescription>Configure how you want to authenticate when logging in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* OTP Requirement Toggle */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
            <div className="space-y-1 flex-1">
              <Label htmlFor="otp-toggle" className="text-base font-semibold cursor-pointer">
                Require OTP on Login
              </Label>
              <p className="text-sm text-muted-foreground">
                {requireOtpOnLogin
                  ? "You will be asked for an OTP code every time you log in for enhanced security."
                  : "You can log in without OTP verification. This makes login faster but less secure."}
              </p>
              {!requireOtpOnLogin && (
                <div className="flex items-start gap-2 mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-yellow-800 dark:text-yellow-300">
                    <strong>Security Notice:</strong> Disabling OTP reduces your account security. We recommend keeping
                    it enabled.
                  </p>
                </div>
              )}
            </div>
            <div className="ml-4 flex items-center">
              {isUpdatingOtpSetting ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  id="otp-toggle"
                  checked={requireOtpOnLogin}
                  onCheckedChange={handleToggleOtpRequirement}
                  disabled={isUpdatingOtpSetting}
                  className="touch-manipulation"
                />
              )}
            </div>
          </div>

          <Separator />

          {/* MPIN Management */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold mb-2">MPIN Management</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Your MPIN is used for trading operations. Keep it secure and change it regularly.
              </p>
            </div>
            <Button
              onClick={() => setShowMPINDialog(true)}
              variant="outline"
              className="w-full sm:w-auto justify-start gap-2 touch-manipulation"
            >
              <Lock className="w-4 h-4" />
              Change MPIN
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security Tips Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security Best Practices
          </CardTitle>
          <CardDescription>Tips to keep your account secure</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Enable OTP Verification</p>
                <p className="text-xs text-muted-foreground">
                  Keep OTP requirement enabled for an extra layer of security on every login.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Change MPIN Regularly</p>
                <p className="text-xs text-muted-foreground">
                  Update your MPIN every few months to prevent unauthorized access.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Never Share Credentials</p>
                <p className="text-xs text-muted-foreground">
                  Never share your password, MPIN, or OTP codes with anyone, including support staff.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Log Out from Shared Devices</p>
                <p className="text-xs text-muted-foreground">
                  Always log out when using public or shared computers or devices.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change MPIN Dialog */}
      <ChangeMPINDialog open={showMPINDialog} onOpenChange={setShowMPINDialog} />
    </motion.div>
  )
}
