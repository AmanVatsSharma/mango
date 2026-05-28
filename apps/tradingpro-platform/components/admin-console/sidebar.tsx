/**
 * @file sidebar.tsx
 * @module admin-console
 * @description Sidebar navigation component for admin console
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-20 — Flex column layout: scrollable nav with primary-tinted scrollbar; status footer no longer overlays menu.
 */

"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { LayoutDashboard, Users, Wallet, Terminal, ChevronLeft, ChevronRight, Activity, Database, Settings, BarChart3, Eraser, Boxes, ListOrdered, Shield, TrendingUp, FileText, Bell, DollarSign, UserCheck, KeyRound, ShieldCheck, Cpu, Fingerprint, Share2, Layers, ReceiptText, BarChart2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { BRAND_ASSETS } from "@/Branding"
import { usePathname } from "next/navigation"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"
import { getAdminConsoleRoute } from "@/lib/branding-routes"

interface SidebarProps {
  activeTab: string
  setActiveTab?: (tab: string) => void // Optional now since we use Link
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
}

const menuItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "User Management", icon: Users },
  { id: "kyc", label: "KYC & CRM", icon: ShieldCheck },
  { id: "rms", label: "RM & Team", icon: UserCheck },
  { id: "funds", label: "Fund Management", icon: Wallet },
  { id: "analytics", label: "Analytics", icon: TrendingUp },
  { id: "audit", label: "Audit Trail", icon: FileText },
  { id: "risk", label: "Risk Management", icon: Shield },
  { id: "system-health", label: "System Health", icon: Activity },
  { id: "workers", label: "Workers", icon: Cpu },
  { id: "financial-reports", label: "Financial Reports", icon: DollarSign },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "advanced", label: "Trades Command", icon: BarChart3 },
  { id: "ledger", label: "Transaction Ledger", icon: ReceiptText },
  { id: "positions", label: "Positions", icon: Boxes },
  { id: "orders", label: "Orders", icon: ListOrdered },
  { id: "cleanup", label: "Cleanup", icon: Eraser },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "logs", label: "Logs & Terminal", icon: Terminal },
  // Super Admin items will be conditionally appended in component based on role
]

export function Sidebar({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  mobileMenuOpen,
  setMobileMenuOpen,
}: SidebarProps) {
  const pathname = usePathname()
  const { user, permissions } = useAdminSession()
  const role = user?.role ?? null
  const adminConsoleRoot = getAdminConsoleRoute()

  // Map menu item IDs to routes
  const getRoute = (id: string) => {
    if (id === 'dashboard') return adminConsoleRoot
    return getAdminConsoleRoute(id)
  }

  const computedMenu = [...menuItems]
  if (role === 'SUPER_ADMIN') {
    computedMenu.splice(3, 0, { id: 'financial-overview', label: 'Financial Overview', icon: Wallet })
  }
  const canViewReferrals =
    permissions.includes("admin.referrals.read") || permissions.includes("admin.all")
  if (canViewReferrals) {
    const usersIdx = computedMenu.findIndex((item) => item.id === "users")
    const referralsItem = { id: "referrals", label: "Referrals", icon: Share2 }
    if (usersIdx >= 0) computedMenu.splice(usersIdx + 1, 0, referralsItem)
    else computedMenu.push(referralsItem)
  }

  const canViewSegments =
    permissions.includes("admin.segments.read") || permissions.includes("admin.all")
  if (canViewSegments) {
    const riskIdx = computedMenu.findIndex((item) => item.id === "risk")
    const segmentsItem = { id: "segments", label: "User Segments", icon: Layers }
    if (riskIdx >= 0) computedMenu.splice(riskIdx + 1, 0, segmentsItem)
    else computedMenu.push(segmentsItem)
  }

  const canViewMarketData =
    permissions.includes("admin.market-data.read") || permissions.includes("admin.all")
  if (canViewMarketData) {
    const segmentsIdx = computedMenu.findIndex((item) => item.id === "segments")
    const riskIdx = computedMenu.findIndex((item) => item.id === "risk")
    const insertAfter = segmentsIdx >= 0 ? segmentsIdx : riskIdx
    const marketDataItem = { id: "market-data", label: "Market Data", icon: BarChart2 }
    if (insertAfter >= 0) computedMenu.splice(insertAfter + 1, 0, marketDataItem)
    else computedMenu.push(marketDataItem)
  }

  const canViewAccessControl =
    permissions.includes("admin.access-control.view") || permissions.includes("admin.all")
  if (canViewAccessControl) {
    const settingsIndex = computedMenu.findIndex((item) => item.id === "settings")
    const accessControlItem = { id: "access-control", label: "Access Control", icon: KeyRound }
    if (settingsIndex >= 0) {
      computedMenu.splice(settingsIndex, 0, accessControlItem)
    } else {
      computedMenu.push(accessControlItem)
    }
  }
  const canViewSessionSecurity =
    permissions.includes("admin.session-security.read") || permissions.includes("admin.all")
  if (canViewSessionSecurity) {
    const auditIndex = computedMenu.findIndex((item) => item.id === "audit")
    const sessionSecurityItem = { id: "session-security", label: "Session Security", icon: Fingerprint }
    if (auditIndex >= 0) {
      computedMenu.splice(auditIndex + 1, 0, sessionSecurityItem)
    } else {
      computedMenu.push(sessionSecurityItem)
    }
  }
  return (
    <>
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      <motion.div
        className={`fixed left-0 top-0 h-dvh max-h-dvh flex flex-col glass-surface border-r border-border z-50 transition-all duration-300 ${
          collapsed ? "w-16" : "w-64"
        } ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        initial={false}
        animate={{
          width: collapsed ? 64 : 256,
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 p-2 sm:p-3 md:p-4 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            {!collapsed ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center space-x-2 min-w-0 flex-1"
              >
                <Image
                  src={BRAND_ASSETS.logos.headerLogo}
                  alt=""
                  width={112}
                  height={36}
                  className="h-7 w-auto shrink-0 object-contain sm:h-8"
                />
                <div className="min-w-0">
                  <h1 className="text-sm sm:text-base md:text-lg font-bold text-primary truncate">TradePro</h1>
                  <p className="text-xs text-muted-foreground truncate">Admin Console</p>
                </div>
              </motion.div>
            ) : (
              <Image
                src={BRAND_ASSETS.logos.headerLogo}
                alt="Admin"
                width={40}
                height={40}
                className="h-8 w-8 shrink-0 object-contain mx-auto"
              />
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setCollapsed(!collapsed)} 
              className="p-1 h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 touch-manipulation"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" /> : <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />}
            </Button>
          </div>
        </div>

        {/* Navigation — scrolls above footer; min-h-0 required for flex overflow */}
        <nav
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1 sm:p-2 space-y-1 pb-2 scrollbar-admin-nav"
          aria-label="Admin console navigation"
        >
          {computedMenu.map((item) => {
            const Icon = item.icon
            const route = getRoute(item.id)
            const isActive = pathname === route || (item.id === 'dashboard' && pathname === adminConsoleRoot)

            return (
              <Link
                key={item.id}
                href={route}
                onClick={() => {
                  setMobileMenuOpen(false)
                }}
              >
                <motion.div
                  className={`w-full flex items-center space-x-2 sm:space-x-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-left transition-all duration-200 touch-manipulation cursor-pointer ${
                    isActive
                      ? "bg-primary/10 text-primary border-l-2 border-primary pl-[6px] sm:pl-[10px]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  aria-label={item.label}
                >
                  <Icon className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="font-medium text-xs sm:text-sm truncate flex-1"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </motion.div>
              </Link>
            )
          })}
        </nav>

        {/* System Status — flow footer so Settings / Logs stay reachable */}
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-shrink-0 mt-auto border-t border-border/60 bg-background/90 px-2 sm:px-4 pt-2 pb-3 sm:pb-4 backdrop-blur-sm"
          >
            <div className="bg-muted/50 rounded-lg p-2 sm:p-3 space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate pr-2">System Status</span>
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <div className="w-2 h-2 bg-primary rounded-full pulse-glow"></div>
                  <span className="text-primary whitespace-nowrap">Online</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate pr-2">Database</span>
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <Database className="w-3 h-3 text-primary" />
                  <span className="text-primary whitespace-nowrap">Connected</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </>
  )
}
