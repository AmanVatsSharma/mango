"use client"

/**
 * @file sidebar-menu.tsx
 * @module components/console
 * @description Console sidebar navigation menu supporting section switching and secure sign-out actions.
 * @author StockTrade
 * @created 2026-02-16
 */

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  User,
  CreditCard,
  FileText,
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  LogOut,
  TrendingUp,
  Shield,
  Gift,
  SlidersHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { signOut } from "next-auth/react"

const menuItems = [
  { id: "profile", label: "Profile", icon: User, description: "Personal info" },
  { id: "account", label: "My Account", icon: CreditCard, description: "View balance" },
  { id: "statements", label: "Statements", icon: FileText, description: "Transaction history" },
  { id: "deposits", label: "Deposits", icon: ArrowDownToLine, description: "Add funds" },
  { id: "withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, description: "Withdraw funds" },
  { id: "banks", label: "Bank Accounts", icon: Building2, description: "Manage banks" },
  { id: "referral", label: "Referral", icon: Gift, description: "Invite & rewards" },
  { id: "referral-settings", label: "Referral Settings", icon: SlidersHorizontal, description: "Referral preferences" },
  { id: "security", label: "Security", icon: Shield, description: "Security settings" },
]

interface SidebarMenuProps {
  activeSection?: string
  onSectionChange?: (section: string) => void
  statementsEnabled?: boolean
}

export function SidebarMenu({ activeSection = "account", onSectionChange, statementsEnabled = true }: SidebarMenuProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  console.log('📱 [SIDEBAR-MENU] Rendering with activeSection:', activeSection)

  const visibleMenuItems = statementsEnabled ? menuItems : menuItems.filter((m) => m.id !== "statements")
  const activeSectionLabel = useMemo(() => {
    return visibleMenuItems.find((item) => item.id === activeSection)?.label || "My Account"
  }, [activeSection, visibleMenuItems])

  const handleLogout = async () => {
    try {
      console.log('🚪 [SIDEBAR-MENU] User logging out')
      await signOut({ callbackUrl: '/' })
    } catch (error) {
      console.error('❌ [SIDEBAR-MENU] Logout error:', error)
    }
  }

  const handleSectionChange = (sectionId: string) => {
    try {
      console.log('📍 [SIDEBAR-MENU] Section changing to:', sectionId)
      onSectionChange?.(sectionId)
    } catch (error) {
      console.error('❌ [SIDEBAR-MENU] Section change error:', error)
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Logo/Brand */}
      <div className="p-5 sm:p-6 lg:p-7 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-center gap-3">
          <motion.div 
            className="w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ duration: 0.2 }}
          >
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
          </motion.div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-foreground text-base sm:text-lg lg:text-xl truncate">
              Trading Console
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              Professional Dashboard
            </p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>
              Sections <span className="font-semibold text-foreground">{visibleMenuItems.length}</span>
            </span>
            <span className="max-w-[60%] truncate text-right">
              Active <span className="font-semibold text-foreground">{activeSectionLabel}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-3 sm:p-4 lg:p-5 overflow-y-auto overscroll-contain">
        <div className="space-y-1">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id

            return (
              <motion.div 
                key={item.id} 
                whileHover={{ x: 2 }} 
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15 }}
              >
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 h-auto py-3 px-4 text-left font-medium transition-all relative overflow-hidden group",
                    "touch-manipulation",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                      : "text-foreground hover:bg-accent/80 hover:text-accent-foreground",
                  )}
                  onClick={() => handleSectionChange(item.id)}
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <Icon className={cn(
                    "w-5 h-5 flex-shrink-0 transition-transform",
                    isActive && "scale-110"
                  )} />
                  <div className="flex flex-col items-start min-w-0 flex-1 gap-0.5">
                    <span className={cn(
                      "text-sm font-semibold truncate w-full",
                      isActive && "text-primary-foreground"
                    )}>
                      {item.label}
                    </span>
                    <span className={cn(
                      "text-xs truncate w-full",
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}>
                      {item.description}
                    </span>
                  </div>
                  
                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-primary-foreground rounded-r-full"
                      transition={{ duration: 0.2 }}
                    />
                  )}
                </Button>
              </motion.div>
            )
          })}
        </div>
      </nav>

      {/* Logout Button */}
      <div className="p-3 sm:p-4 border-t border-border bg-gradient-to-br from-destructive/5 to-transparent">
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start gap-3 h-auto py-3 px-4 text-destructive hover:bg-destructive/10 hover:text-destructive transition-all touch-manipulation font-medium"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-semibold">Logout</span>
          </Button>
        </motion.div>
      </div>
    </div>
  )
}
