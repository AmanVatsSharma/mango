/**
 * @file risk-management.tsx
 * @module admin-console
 * @description Enterprise risk management dashboard — thin shell that composes the 5 risk sub-tabs
 * @updated 2026-04-14 — Full overhaul: split into sub-tabs, live exposure with auto-refresh, bulk liquidation, enhanced UX
 */

"use client"

import { useState } from "react"
import { Shield } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader, RefreshButton } from "./shared"
import { ExposureTab } from "./risk-management/exposure-tab"
import { MonitoringTab } from "./risk-management/monitoring-tab"
import { PlatformConfigTab } from "./risk-management/platform-config-tab"
import { UserLimitsTab } from "./risk-management/user-limits-tab"
import { PoliciesTab } from "./risk-management/policies-tab"

export function RiskManagement() {
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefreshAll = () => setRefreshKey((k) => k + 1)

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      <PageHeader
        title="Risk Management"
        description="Monitor and control trading risks across the platform"
        icon={<Shield className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={<RefreshButton onClick={handleRefreshAll} loading={false} />}
      />

      <Tabs defaultValue="exposure" className="space-y-3 sm:space-y-4 md:space-y-6">
        <TabsList className="grid w-full grid-cols-5 text-xs sm:text-sm">
          <TabsTrigger value="exposure" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <span className="hidden sm:inline">Live Exposure</span>
            <span className="sm:hidden">Exposure</span>
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <span className="hidden sm:inline">Monitoring</span>
            <span className="sm:hidden">Monitor</span>
          </TabsTrigger>
          <TabsTrigger value="platform" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <span className="hidden sm:inline">Platform Config</span>
            <span className="sm:hidden">Platform</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <span className="hidden sm:inline">User Limits</span>
            <span className="sm:hidden">Users</span>
          </TabsTrigger>
          <TabsTrigger value="policies" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <span>Policies</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="exposure" className="space-y-3 sm:space-y-4 md:space-y-6">
          <ExposureTab refreshKey={refreshKey} />
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-3 sm:space-y-4 md:space-y-6">
          <MonitoringTab refreshKey={refreshKey} />
        </TabsContent>

        <TabsContent value="platform" className="space-y-3 sm:space-y-4 md:space-y-6">
          <PlatformConfigTab refreshKey={refreshKey} />
        </TabsContent>

        <TabsContent value="users" className="space-y-3 sm:space-y-4 md:space-y-6">
          <UserLimitsTab refreshKey={refreshKey} />
        </TabsContent>

        <TabsContent value="policies" className="space-y-3 sm:space-y-4 md:space-y-6">
          <PoliciesTab refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
