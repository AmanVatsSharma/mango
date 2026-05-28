"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { createClientLogger } from "@/lib/logging/client-logger"

const logger = createClientLogger("Settings")

/**
 * Admin Console Settings Component
 *
 * Allows admin to:
 * - Upload payment QR code
 * - Set UPI ID
 * - Configure platform settings
 * - Update profile image
 *
 * Features:
 * - Image upload with preview
 * - Real-time validation
 * - AWS S3 integration
 * - Comprehensive error handling
 */
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  Upload,
  Image as ImageIcon,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  QrCode,
  CreditCard,
  Settings as SettingsIcon,
  DollarSign,
  Shield,
  ChevronDown,
  HelpCircle,
  UserRound,
  Activity,
} from "lucide-react"
import { PageHeader, RefreshButton } from "./shared"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { Switch } from "@/components/ui/switch"
import { HomeTabSettings } from "./home-tab-settings"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import {
  DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1,
  parseClientRmDisplayPolicyJson,
  type ClientRmDisplayPolicyV1,
  type RmFieldMode,
  type WhatsappDisplayMode,
} from "@/lib/types/rm-client-display"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PaymentDepositSettingsPanel } from "./payment-deposit-settings-panel"
import type { PaymentDepositConfigV1 } from "@/lib/payment-deposit-config.shared"
import {
  getDefaultPaymentDepositConfigV1,
  resolvePaymentDepositConfigDraft,
} from "@/lib/payment-deposit-config.shared"
import { PAYMENT_DEPOSIT_CONFIG_V1_KEY } from "@/lib/payment-deposit-public"
import Link from "next/link"
import { getAdminConsoleRoute } from "@/lib/branding-routes"

interface SystemSetting {
  id: string
  key: string
  value: string
  description: string | null
  category: string
  isActive: boolean
}

export function Settings() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  
  const [depositConfigDraft, setDepositConfigDraft] = useState<PaymentDepositConfigV1>(() =>
    getDefaultPaymentDepositConfigV1()
  )
  
  // Profile settings
  const [profileImage, setProfileImage] = useState<string>("")
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null)
  const [profileImagePreview, setProfileImagePreview] = useState<string>("")
  const [adminName, setAdminName] = useState<string>("")
  const [adminEmail, setAdminEmail] = useState<string>("")

  // Maintenance mode settings
  const [maintenanceEnabled, setMaintenanceEnabled] = useState<boolean>(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState<string>("")
  const [maintenanceEndTime, setMaintenanceEndTime] = useState<string>("")
  const [maintenanceAllowBypass, setMaintenanceAllowBypass] = useState<boolean>(true)
  const [maintenanceSaving, setMaintenanceSaving] = useState<boolean>(false)

  // Console feature toggles
  const [statementsEnabledGlobal, setStatementsEnabledGlobal] = useState<boolean>(true)
  const [kycEnforcementEnabled, setKycEnforcementEnabled] = useState<boolean>(true)
  const [activeUserClassificationEnabled, setActiveUserClassificationEnabled] = useState<boolean>(false)
  const [activeUserLowBalanceThreshold, setActiveUserLowBalanceThreshold] = useState<string>("1000")
  const [activeUserInactivityDays, setActiveUserInactivityDays] = useState<string>("30")
  const [consoleTogglesSaving, setConsoleTogglesSaving] = useState<boolean>(false)

  // Registration settings
  const [simpleRegistrationEnabled, setSimpleRegistrationEnabled] = useState<boolean>(false)
  const [registrationSettingsSaving, setRegistrationSettingsSaving] = useState<boolean>(false)

  const [clientRmPolicyDraft, setClientRmPolicyDraft] = useState<ClientRmDisplayPolicyV1>(() => ({
    ...DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1,
    fields: { ...DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1.fields },
  }))
  const [clientRmPolicySaving, setClientRmPolicySaving] = useState(false)

  /** Read-only snapshot of RiskConfig (canonical editor: Risk Management). */
  const [brokerageConfigs, setBrokerageConfigs] = useState<any[]>([])
  const [loadingBrokerages, setLoadingBrokerages] = useState(false)
  
  // File input refs
  const profileFileInputRef = useRef<HTMLInputElement>(null)

  logger.info({ requestId: crypto.randomUUID() }, "Settings component rendered")

  /**
   * Fetch brokerage configurations
   */
  const fetchBrokerageConfigs = async () => {
    logger.info({ requestId: crypto.randomUUID() }, "Fetching brokerage configs")
    setLoadingBrokerages(true)
    try {
      const response = await fetch('/api/admin/risk/config')
      if (response.ok) {
        const data = await response.json()
        setBrokerageConfigs(data.configs || [])
        logger.info("Brokerage configs loaded", { count: data.configs?.length })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load configurations"
      logger.error("Error fetching brokerage configs:", message)
      toast({
        title: "Error",
        description: "Failed to load brokerage configurations",
        variant: "destructive"
      })
    } finally {
      setLoadingBrokerages(false)
    }
  }

  /**
   * Fetch current settings
   */
  const fetchSettings = async () => {
    logger.info({ requestId: crypto.randomUUID() }, "Fetching current settings")
    setRefreshing(true)

    try {
      const response = await fetch('/api/admin/settings')
      const data = await response.json()

      if (data.success && data.settings) {
        logger.info({ requestId: crypto.randomUUID() }, "Settings loaded", { count: data.settings.length })

        // Parse settings
        data.settings.forEach((setting: SystemSetting) => {
          logger.debug({ requestId: crypto.randomUUID() }, "Setting parsed", { key: setting.key, valueLength: setting.value?.length })
          
          if (setting.key === 'maintenance_mode_enabled') {
            setMaintenanceEnabled(setting.value === 'true')
          } else if (setting.key === 'maintenance_message') {
            setMaintenanceMessage(setting.value)
          } else if (setting.key === 'maintenance_end_time') {
            setMaintenanceEndTime(setting.value)
          } else if (setting.key === 'maintenance_allow_admin_bypass') {
            setMaintenanceAllowBypass(setting.value !== 'false')
          } else if (setting.key === 'console_statements_enabled_global') {
            setStatementsEnabledGlobal(setting.value !== 'false')
          } else if (setting.key === 'kyc_enforcement_enabled') {
            setKycEnforcementEnabled(setting.value !== 'false')
          } else if (setting.key === 'active_user_classification_enabled') {
            setActiveUserClassificationEnabled(setting.value === 'true')
          } else if (setting.key === 'active_user_low_balance_threshold') {
            setActiveUserLowBalanceThreshold(setting.value || "1000")
          } else if (setting.key === 'active_user_inactivity_days') {
            setActiveUserInactivityDays(setting.value || "30")
          } else if (setting.key === ADMIN_SETTING_KEYS.CLIENT_RM_DISPLAY_POLICY_V1) {
            setClientRmPolicyDraft(parseClientRmDisplayPolicyJson(setting.value))
          } else if (setting.key === ADMIN_SETTING_KEYS.SIMPLE_REGISTRATION_ENABLED) {
            setSimpleRegistrationEnabled(setting.value === 'true')
          }
        })

        const byKey = new Map<string, string>()
        for (const s of data.settings as SystemSetting[]) {
          if (!byKey.has(s.key)) {
            byKey.set(s.key, s.value)
          }
        }
        setDepositConfigDraft(resolvePaymentDepositConfigDraft(byKey))
      }
    } catch (error) {
      logger.error({ requestId: crypto.randomUUID() }, "Error fetching settings", { error })
      toast({
        title: "Error",
        description: "Failed to load settings",
        variant: "destructive"
      })
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchSettings()
    fetchMaintenanceSettings()
    fetchBrokerageConfigs()
  }, [])

  const savePaymentDepositConfig = async () => {
    logger.info({ requestId: crypto.randomUUID() }, "Saving deposit config")
    setSaving(true)

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: PAYMENT_DEPOSIT_CONFIG_V1_KEY,
          value: JSON.stringify(depositConfigDraft),
          description: "Deposit payment methods v1",
          category: "PAYMENT",
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        const base = (result.message || result.error || "Failed to save") as string
        const issues = result.details?.issues
        let description = base
        if (Array.isArray(issues) && issues.length > 0 && typeof issues[0]?.message === "string") {
          const tail = issues
            .map((row: { message?: string }) => row.message)
            .filter(Boolean)
            .slice(0, 8)
            .join("; ")
          if (tail && !base.includes(tail.slice(0, 40))) {
            description = `${base} — ${tail}`
          }
        }
        throw new Error(description)
      }

      toast({
        title: "✅ Settings Saved",
        description: "Deposit configuration updated successfully",
      })

      await fetchSettings()
    } catch (error: unknown) {
      logger.error({ requestId: crypto.randomUUID() }, "Save failed", { error })
      toast({
        title: "❌ Save Failed",
        description:
          error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  /**
   * Fetch maintenance settings
   */
  const fetchMaintenanceSettings = async () => {
    logger.info({ requestId: crypto.randomUUID() }, "Fetching maintenance settings")
    try {
      const response = await fetch('/api/admin/settings?category=MAINTENANCE')
      const data = await response.json()

      if (data.success && data.settings) {
        logger.info({ requestId: crypto.randomUUID() }, "Maintenance settings loaded", { count: data.settings.length })
        
        data.settings.forEach((setting: SystemSetting) => {
          if (setting.key === 'maintenance_mode_enabled') {
            setMaintenanceEnabled(setting.value === 'true')
          } else if (setting.key === 'maintenance_message') {
            setMaintenanceMessage(setting.value)
          } else if (setting.key === 'maintenance_end_time') {
            setMaintenanceEndTime(setting.value)
          } else if (setting.key === 'maintenance_allow_admin_bypass') {
            setMaintenanceAllowBypass(setting.value !== 'false')
          }
        })
      }
    } catch (error: any) {
      logger.error({ requestId: crypto.randomUUID() }, "Error fetching maintenance settings", { error })
    }
  }

  /**
   * Save maintenance settings
   */
  const saveMaintenanceSettings = async () => {
    setMaintenanceSaving(true)
    try {
      const response = await fetch('/api/maintenance/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: maintenanceEnabled,
          message: maintenanceMessage || undefined,
          endTime: maintenanceEndTime || undefined,
          allowAdminBypass: maintenanceAllowBypass
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save maintenance settings')
      }

      logger.info({ requestId: crypto.randomUUID() }, "Maintenance settings saved successfully")
      toast({
        title: "✅ Saved",
        description: "Maintenance mode settings updated successfully"
      })

      // Refresh settings
      await fetchMaintenanceSettings()
    } catch (error: any) {
      logger.error({ requestId: crypto.randomUUID() }, "Save maintenance settings failed", { error })
      toast({
        title: "❌ Save Failed",
        description: error.message || "Unable to save maintenance settings",
        variant: "destructive"
      })
    } finally {
      setMaintenanceSaving(false)
    }
  }

  /**
   * Save console feature toggles
   */
  const saveConsoleToggles = async () => {
    const normalizedLowBalanceThreshold = Number(activeUserLowBalanceThreshold)
    const normalizedInactivityDays = Number(activeUserInactivityDays)
    if (!Number.isFinite(normalizedLowBalanceThreshold) || normalizedLowBalanceThreshold < 0) {
      toast({
        title: "❌ Validation Error",
        description: "Low balance threshold must be a non-negative number",
        variant: "destructive",
      })
      return
    }
    if (!Number.isFinite(normalizedInactivityDays) || normalizedInactivityDays < 1) {
      toast({
        title: "❌ Validation Error",
        description: "Inactivity days must be at least 1",
        variant: "destructive",
      })
      return
    }

    logger.info({ requestId: crypto.randomUUID() }, "Saving general toggles")
    setConsoleTogglesSaving(true)
    try {
      const statementsRes = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "console_statements_enabled_global",
          value: String(statementsEnabledGlobal),
          description: "App-wide toggle for end-user statements UI (dashboard + console)",
          category: "CONSOLE",
        }),
      })
      const statementsData = await statementsRes.json().catch(() => ({}))
      if (!statementsRes.ok || !statementsData?.success) {
        throw new Error(statementsData?.error || "Failed to save console settings")
      }

      const kycRes = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "kyc_enforcement_enabled",
          value: String(kycEnforcementEnabled),
          description: "Global KYC enforcement toggle for authentication and protected route gating",
          category: "KYC",
        }),
      })
      const kycData = await kycRes.json().catch(() => ({}))
      if (!kycRes.ok || !kycData?.success) {
        throw new Error(kycData?.error || "Failed to save KYC enforcement setting")
      }

      const activeUserEnabledRes = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "active_user_classification_enabled",
          value: String(activeUserClassificationEnabled),
          description:
            "When enabled, users with low balance and no recent trading activity are excluded from active-user counts",
          category: "ANALYTICS",
        }),
      })
      const activeUserEnabledData = await activeUserEnabledRes.json().catch(() => ({}))
      if (!activeUserEnabledRes.ok || !activeUserEnabledData?.success) {
        throw new Error(activeUserEnabledData?.error || "Failed to save active-user policy toggle")
      }

      const activeUserThresholdRes = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "active_user_low_balance_threshold",
          value: String(Math.trunc(normalizedLowBalanceThreshold)),
          description: "Low balance threshold (X) for active-user exclusion policy",
          category: "ANALYTICS",
        }),
      })
      const activeUserThresholdData = await activeUserThresholdRes.json().catch(() => ({}))
      if (!activeUserThresholdRes.ok || !activeUserThresholdData?.success) {
        throw new Error(activeUserThresholdData?.error || "Failed to save active-user balance threshold")
      }

      const activeUserDaysRes = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "active_user_inactivity_days",
          value: String(Math.trunc(normalizedInactivityDays)),
          description: "No-trading days threshold (Y) for active-user exclusion policy",
          category: "ANALYTICS",
        }),
      })
      const activeUserDaysData = await activeUserDaysRes.json().catch(() => ({}))
      if (!activeUserDaysRes.ok || !activeUserDaysData?.success) {
        throw new Error(activeUserDaysData?.error || "Failed to save active-user inactivity days")
      }

      toast({
        title: "✅ Saved",
        description: "General settings updated successfully",
      })
      await fetchSettings()
    } catch (e: any) {
      logger.error({ requestId: crypto.randomUUID() }, "Save general toggles failed", { error: e })
      toast({
        title: "❌ Save Failed",
        description: e?.message || "Unable to save general settings",
        variant: "destructive",
      })
    } finally {
      setConsoleTogglesSaving(false)
    }
  }

  const setRmFieldMode = (
    field: keyof ClientRmDisplayPolicyV1["fields"],
    mode: RmFieldMode
  ) => {
    setClientRmPolicyDraft((d) => ({
      ...d,
      fields: {
        ...d.fields,
        [field]: {
          ...d.fields[field],
          mode,
          platformValue: mode === "PLATFORM" ? d.fields[field].platformValue : undefined,
        },
      },
    }))
  }

  const setRmFieldPlatformValue = (
    field: keyof ClientRmDisplayPolicyV1["fields"],
    platformValue: string
  ) => {
    setClientRmPolicyDraft((d) => ({
      ...d,
      fields: {
        ...d.fields,
        [field]: { ...d.fields[field], platformValue },
      },
    }))
  }

  const saveClientRmDisplayPolicy = async () => {
    setClientRmPolicySaving(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: ADMIN_SETTING_KEYS.CLIENT_RM_DISPLAY_POLICY_V1,
          value: JSON.stringify(clientRmPolicyDraft),
          category: "CLIENT_EXPERIENCE",
          description: "Client Account tab: RM card visibility, field sources, WhatsApp policy",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.error || "Failed to save RM display policy")
      }
      toast({ title: "Saved", description: "Client-facing RM display policy updated" })
      await fetchSettings()
    } catch (err: unknown) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setClientRmPolicySaving(false)
    }
  }

  const saveRegistrationSettings = async () => {
    setRegistrationSettingsSaving(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: ADMIN_SETTING_KEYS.SIMPLE_REGISTRATION_ENABLED,
          value: simpleRegistrationEnabled ? "true" : "false",
          category: "REGISTRATION",
          description: "When enabled, allows registration with just name + password (no email/phone required)",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.error || "Failed to save registration settings")
      }
      toast({ title: "Saved", description: "Registration settings updated" })
      await fetchSettings()
    } catch (err: unknown) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setRegistrationSettingsSaving(false)
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* Header */}
      <PageHeader
        title="Settings"
        description="Configure platform settings and payment options"
        icon={<SettingsIcon className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={<RefreshButton onClick={fetchSettings} loading={refreshing} />}
      />

      {/* Settings Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Tabs defaultValue="payment" className="space-y-3 sm:space-y-4 md:space-y-6">
          <TabsList className="bg-muted/50 w-full sm:w-auto flex flex-col sm:flex-row">
            <TabsTrigger value="payment" className="text-xs sm:text-sm w-full sm:w-auto">
              <CreditCard className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Payment Settings</span>
              <span className="sm:hidden">Payment</span>
            </TabsTrigger>
            <TabsTrigger value="brokerage" className="text-xs sm:text-sm w-full sm:w-auto">
              <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Brokerage
            </TabsTrigger>
            <TabsTrigger value="general" className="text-xs sm:text-sm w-full sm:w-auto">
              <SettingsIcon className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="market" className="text-xs sm:text-sm w-full sm:w-auto">
              <SettingsIcon className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Market Controls</span>
              <span className="sm:hidden">Market</span>
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="text-xs sm:text-sm w-full sm:w-auto">
              <SettingsIcon className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Maintenance Mode</span>
              <span className="sm:hidden">Maintenance</span>
            </TabsTrigger>
            <TabsTrigger value="home-tab" className="text-xs sm:text-sm w-full sm:w-auto">
              <SettingsIcon className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Home Tab</span>
              <span className="sm:hidden">Home</span>
            </TabsTrigger>
          </TabsList>

          {/* Payment Settings Tab */}
          <TabsContent value="payment">
            <PaymentDepositSettingsPanel
              value={depositConfigDraft}
              onChange={setDepositConfigDraft}
              saving={saving}
              onSave={savePaymentDepositConfig}
            />
          </TabsContent>

          {/* Brokerage: read-only; full edit is in Risk Management (single source of truth). */}
          <TabsContent value="brokerage">
            <Card className="bg-card border-border shadow-sm neon-border">
              <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg sm:text-xl font-bold text-primary break-words">
                      Platform margin &amp; brokerage (read-only)
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm break-words">
                      Leverage, brokerage, margin rate, and limits are configured under Risk Management.
                      Statutory/order charges remain under Orders. This tab is a quick snapshot only.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    <RefreshButton onClick={fetchBrokerageConfigs} loading={loadingBrokerages} size="sm" />
                    <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
                      <Link href={getAdminConsoleRoute("risk")}>
                        <Shield className="w-4 h-4 mr-2" />
                        Open Risk Management
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingBrokerages ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading risk configurations...
                  </div>
                ) : brokerageConfigs.length === 0 ? (
                  <Alert className="bg-yellow-500/10 border-yellow-500/50">
                    <DollarSign className="h-4 w-4 text-yellow-500" />
                    <AlertTitle className="text-yellow-500">No platform risk rows</AlertTitle>
                    <AlertDescription className="text-yellow-500/80">
                      Add segment/product policies in Risk Management (Platform Risk Configurations).
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border">
                          <TableHead>Segment</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Leverage</TableHead>
                          <TableHead>Margin rate</TableHead>
                          <TableHead>Brokerage</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {brokerageConfigs.map((config) => (
                          <TableRow key={config.id} className="border-border">
                            <TableCell className="font-medium text-foreground">{config.segment}</TableCell>
                            <TableCell>{config.productType}</TableCell>
                            <TableCell className="font-mono">{config.leverage != null ? Number(config.leverage) : "—"}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              {config.marginRate != null ? String(config.marginRate) : "—"}
                            </TableCell>
                            <TableCell>
                              {config.brokerageFlat != null ? (
                                <span className="font-mono">₹{Number(config.brokerageFlat).toFixed(2)} flat</span>
                              ) : config.brokerageRate != null ? (
                                <span className="font-mono">{Number(config.brokerageRate).toFixed(4)} rate</span>
                              ) : (
                                <span className="text-muted-foreground">default</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {config.active ? (
                                <Badge className="bg-green-400/20 text-green-400 border-green-400/30">Active</Badge>
                              ) : (
                                <Badge className="bg-gray-400/20 text-gray-400 border-gray-400/30">Inactive</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {config.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* General Settings Tab */}
          <TabsContent value="general">
            <Card className="bg-card border-border shadow-sm neon-border">
              <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-lg sm:text-xl font-bold text-primary">General Settings</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Platform-wide configuration options
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6 space-y-4">
                {/* Statements toggle */}
                <div className="flex items-center justify-between p-4 rounded-md bg-muted/50 border border-border">
                  <div className="space-y-1">
                    <Label className="text-foreground font-medium">Enable Statements (app-wide)</Label>
                    <p className="text-xs text-muted-foreground">
                      When disabled, end users will not see statement sections in dashboard or console.
                    </p>
                  </div>
                  <Switch checked={statementsEnabledGlobal} onCheckedChange={setStatementsEnabledGlobal} />
                </div>
                <div className="flex items-center justify-between p-4 rounded-md bg-muted/50 border border-border">
                  <div className="space-y-1">
                    <Label className="text-foreground font-medium">Enforce KYC (app-wide)</Label>
                    <p className="text-xs text-muted-foreground">
                      When disabled, KYC redirects and trading KYC blocks are bypassed, while phone verification and mPin checks remain active.
                    </p>
                  </div>
                  <Switch checked={kycEnforcementEnabled} onCheckedChange={setKycEnforcementEnabled} />
                </div>
                {/* Simple Registration toggle */}
                <div className="flex items-center justify-between p-4 rounded-md bg-muted/50 border border-border">
                  <div className="space-y-1">
                    <Label className="text-foreground font-medium">Simple Registration</Label>
                    <p className="text-xs text-muted-foreground">
                      When enabled, users can register with just name + password + mPIN (no email/phone required). Auto-generates Client ID.
                    </p>
                  </div>
                  <Switch checked={simpleRegistrationEnabled} onCheckedChange={setSimpleRegistrationEnabled} />
                </div>
                <div className="space-y-4 p-4 rounded-md bg-muted/50 border border-border">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-foreground font-medium">Active User Eligibility Policy</Label>
                      <p className="text-xs text-muted-foreground">
                        Exclude users from active-user counts when balance is below X and they have not traded for Y days.
                      </p>
                    </div>
                    <Switch
                      checked={activeUserClassificationEnabled}
                      onCheckedChange={setActiveUserClassificationEnabled}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Low Balance Threshold (X)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={activeUserLowBalanceThreshold}
                        onChange={(e) => setActiveUserLowBalanceThreshold(e.target.value)}
                        className="bg-background border-border"
                        placeholder="1000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">No Trading Days (Y)</Label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={activeUserInactivityDays}
                        onChange={(e) => setActiveUserInactivityDays(e.target.value)}
                        className="bg-background border-border"
                        placeholder="30"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveConsoleToggles} disabled={consoleTogglesSaving} className="bg-primary text-primary-foreground">
                    {consoleTogglesSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>Save Settings</>
                    )}
                  </Button>
                </div>
                {/* Registration Settings Save */}
                <div className="flex justify-end pt-4 border-t border-border/50">
                  <Button onClick={saveRegistrationSettings} disabled={registrationSettingsSaving} className="bg-primary text-primary-foreground">
                    {registrationSettingsSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>Save Registration Settings</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6 overflow-hidden border-border/80 bg-card shadow-sm">
              <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-5 sm:py-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <UserRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-semibold tracking-tight sm:text-base">
                      Client RM on Account tab
                    </CardTitle>
                    <CardDescription className="text-xs leading-snug text-muted-foreground">
                      Visibility and data sources for the end-user RM strip. Per-RM masks live under RM &amp; Teams →
                      Client contact.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-0 px-0 pb-0 pt-0">
                <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-border/60">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 sm:p-4">
                    <div className="min-w-0 space-y-0.5">
                      <Label className="text-xs font-medium text-foreground">Account RM block</Label>
                      <p className="text-[11px] leading-tight text-muted-foreground">
                        Hidden removes the whole section for clients.
                      </p>
                    </div>
                    <Select
                      value={clientRmPolicyDraft.card}
                      onValueChange={(v) =>
                        setClientRmPolicyDraft((d) => ({
                          ...d,
                          card: v === "HIDE" ? "HIDE" : "SHOW",
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 w-[min(11rem,42vw)] shrink-0 border-border/80 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SHOW">Visible</SelectItem>
                        <SelectItem value="HIDE">Hidden</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3 sm:border-t-0 sm:p-4">
                    <div className="min-w-0 space-y-0.5">
                      <Label className="text-xs font-medium text-foreground">Request RM (no assignee)</Label>
                      <p className="text-[11px] leading-tight text-muted-foreground">
                        Empty state + CTA when nobody is assigned.
                      </p>
                    </div>
                    <Switch
                      className="shrink-0"
                      checked={clientRmPolicyDraft.showRequestRmWhenUnassigned}
                      onCheckedChange={(v) =>
                        setClientRmPolicyDraft((d) => ({ ...d, showRequestRmWhenUnassigned: v }))
                      }
                    />
                  </div>
                </div>

                <Separator className="bg-border/60" />

                <div className="px-4 pb-3 pt-3 sm:px-5">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Field sources
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        { key: "name" as const, label: "Name" },
                        { key: "email" as const, label: "Email" },
                        { key: "phone" as const, label: "Phone" },
                        { key: "image" as const, label: "Photo URL" },
                      ] as const
                    ).map(({ key, label }) => (
                      <div
                        key={key}
                        className="rounded-lg border border-border/70 bg-background/70 p-2.5 shadow-[inset_0_1px_0_0_hsl(var(--border)/0.35)]"
                      >
                        <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {label}
                        </Label>
                        <div className="mt-1.5 space-y-1.5">
                          <Select
                            value={clientRmPolicyDraft.fields[key].mode}
                            onValueChange={(v) => setRmFieldMode(key, v as RmFieldMode)}
                          >
                            <SelectTrigger className="h-8 border-border/80 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="REAL">RM / override</SelectItem>
                              <SelectItem value="HIDDEN">Hidden</SelectItem>
                              <SelectItem value="PLATFORM">Platform</SelectItem>
                            </SelectContent>
                          </Select>
                          {clientRmPolicyDraft.fields[key].mode === "PLATFORM" && (
                            <Input
                              className="h-8 border-border/80 text-xs"
                              placeholder={key === "image" ? "https://…" : "Shown to all clients"}
                              value={clientRmPolicyDraft.fields[key].platformValue ?? ""}
                              onChange={(e) => setRmFieldPlatformValue(key, e.target.value)}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border/60 bg-muted/10 px-4 py-3 sm:px-5">
                  <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    WhatsApp
                  </Label>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <Select
                        value={clientRmPolicyDraft.whatsapp.mode}
                        onValueChange={(v) =>
                          setClientRmPolicyDraft((d) => ({
                            ...d,
                            whatsapp: {
                              ...d.whatsapp,
                              mode: v as WhatsappDisplayMode,
                              platformValue:
                                v === "PLATFORM" ? d.whatsapp.platformValue : undefined,
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 border-border/80 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INHERIT_PHONE">Match phone</SelectItem>
                          <SelectItem value="REAL">RM WA override → phone</SelectItem>
                          <SelectItem value="HIDDEN">Hidden</SelectItem>
                          <SelectItem value="PLATFORM">Platform number</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {clientRmPolicyDraft.whatsapp.mode === "PLATFORM" && (
                      <Input
                        className="h-8 shrink-0 border-border/80 text-xs sm:max-w-xs sm:flex-1"
                        placeholder="Digits for wa.me"
                        value={clientRmPolicyDraft.whatsapp.platformValue ?? ""}
                        onChange={(e) =>
                          setClientRmPolicyDraft((d) => ({
                            ...d,
                            whatsapp: { ...d.whatsapp, platformValue: e.target.value },
                          }))
                        }
                      />
                    )}
                  </div>
                </div>

                <div className="flex justify-end border-t border-border/60 bg-muted/15 px-4 py-2.5 sm:px-5">
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveClientRmDisplayPolicy}
                    disabled={clientRmPolicySaving}
                    className="gap-1.5"
                  >
                    {clientRmPolicySaving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5" />
                        Save policy
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Market Controls Tab — moved to dedicated Market Data admin page */}
          <TabsContent value="market">
            <Card className="bg-card border-border shadow-sm neon-border">
              <CardHeader className="px-4 pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Market Data Controls</CardTitle>
                    <CardDescription className="text-xs">
                      Market controls, exchange rules, segments, display settings and spread/slippage
                      configuration have moved to a dedicated full-screen admin page.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <Button asChild>
                  <Link href={getAdminConsoleRoute("market-data")}>
                    <Activity className="w-4 h-4 mr-2" />
                    Open Market Data Admin
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Maintenance Mode Tab */}
          <TabsContent value="maintenance">
            <Card className="bg-card border-border shadow-sm neon-border">
              <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-lg sm:text-xl font-bold text-primary">Maintenance Mode</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Control platform maintenance mode. When enabled, most users see the maintenance page. SUPER_ADMIN always has full access; whether ADMIN can bypass is controlled by the option below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 px-3 sm:px-6 pb-3 sm:pb-6">
                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 rounded-md bg-muted/50">
                  <div>
                    <Label className="text-foreground font-medium text-lg">Enable Maintenance Mode</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      When enabled, users without bypass (and guests) are redirected to the maintenance page
                    </p>
                  </div>
                  <Switch 
                    checked={maintenanceEnabled} 
                    onCheckedChange={setMaintenanceEnabled}
                    className="data-[state=checked]:bg-orange-500"
                  />
                </div>

                {/* Maintenance Message */}
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Maintenance Message</Label>
                  <textarea
                    value={maintenanceMessage}
                    onChange={(e) => setMaintenanceMessage(e.target.value)}
                    className="w-full min-h-[100px] text-sm p-3 rounded-md border bg-muted/50 border-border focus:border-primary"
                    placeholder="We're performing scheduled maintenance to improve your experience. We'll be back shortly!"
                  />
                  <p className="text-xs text-muted-foreground">
                    This message will be displayed to users during maintenance
                  </p>
                </div>

                {/* End Time */}
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Expected End Time</Label>
                  <Input
                    value={maintenanceEndTime}
                    onChange={(e) => setMaintenanceEndTime(e.target.value)}
                    placeholder="2025-01-27T18:00:00Z or '24Hrs'"
                    className="bg-muted/50 border-border focus:border-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    ISO timestamp or descriptive text (e.g., "24Hrs", "2 hours")
                  </p>
                </div>

                {/* Admin Bypass Toggle */}
                <div className="flex items-center justify-between p-4 rounded-md bg-muted/50">
                  <div>
                    <Label className="text-foreground font-medium">Allow ADMIN bypass</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      When on, ADMIN users can use the platform during maintenance. SUPER_ADMIN always bypasses maintenance regardless of this setting.
                    </p>
                  </div>
                  <Switch 
                    checked={maintenanceAllowBypass} 
                    onCheckedChange={setMaintenanceAllowBypass}
                  />
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-4">
                  <Button
                    onClick={saveMaintenanceSettings}
                    disabled={maintenanceSaving}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {maintenanceSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Maintenance Settings
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Home Tab Settings Tab */}
          <TabsContent value="home-tab">
            <HomeTabSettings />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}