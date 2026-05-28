"use client"

/**
 * @file console-layout.tsx
 * @module components/console
 * @description Console shell orchestrating desktop rail/mobile drawer, topbar, and section canvas.
 * @author StockTrade
 * @created 2026-02-16
 */

import type React from "react"

import { useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { SidebarMenu } from "./sidebar-menu"
import { Topbar } from "./topbar"
import { Sidebar, MobileSidebar, DesktopSidebar, useSidebar } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"

interface ConsoleLayoutProps {
  children: React.ReactNode
  activeSection?: string
  onNavigateSection?: (section: string) => void
  statementsEnabled?: boolean
}

const SECTION_META: Record<string, { title: string; description: string }> = {
  profile: {
    title: "Profile Workspace",
    description: "Manage personal identity details, account status, and security preferences.",
  },
  account: {
    title: "Account Workspace",
    description: "Track balance, exposure, and performance metrics in one place.",
  },
  statements: {
    title: "Statements Workspace",
    description: "Review transaction history, apply filters, and export reports.",
  },
  deposits: {
    title: "Deposits Workspace",
    description: "Add funds with clear payment workflows and processing visibility.",
  },
  withdrawals: {
    title: "Withdrawals Workspace",
    description: "Request fund transfers and monitor withdrawal lifecycle status.",
  },
  banks: {
    title: "Bank Accounts Workspace",
    description: "Manage linked bank accounts used for deposits and withdrawals.",
  },
  security: {
    title: "Security Workspace",
    description: "Control OTP/MPIN settings and keep account protection standards high.",
  },
}

const SECTION_ORDER: string[] = ["profile", "account", "statements", "deposits", "withdrawals", "banks", "security"]

function ConsoleLayoutInner({ children, activeSection, onNavigateSection, statementsEnabled }: ConsoleLayoutProps) {
  const { open, setOpen } = useSidebar()
  const sectionMeta = SECTION_META[activeSection || "account"] || SECTION_META.account
  const visibleSectionOrder = useMemo(
    () => (statementsEnabled === false ? SECTION_ORDER.filter((section) => section !== "statements") : SECTION_ORDER),
    [statementsEnabled],
  )
  const activeSectionIndex = useMemo(() => {
    const resolvedActiveSection = activeSection || "account"
    const index = visibleSectionOrder.indexOf(resolvedActiveSection)
    return index >= 0 ? index + 1 : 1
  }, [activeSection, visibleSectionOrder])
  
  console.log('🎨 [CONSOLE-LAYOUT] Rendering with:', { activeSection, sidebarOpen: open })

  // Body scroll lock
  useEffect(() => {
    if (open) {
      console.log('🔒 [CONSOLE-LAYOUT] Locking body scroll')
      document.body.style.overflow = 'hidden'
    } else {
      console.log('🔓 [CONSOLE-LAYOUT] Unlocking body scroll')
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [open])

  // Ensure mobile overlay never stays open on large screens
  useEffect(() => {
    const handleResize = () => {
      const isDesktop = window.innerWidth >= 1024 // lg breakpoint
      if (isDesktop && open) {
        console.log('🧹 [CONSOLE-LAYOUT] Auto-closing mobile sidebar on desktop')
        setOpen(false)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [open, setOpen])

  const handleSectionChange = (section: string) => {
    console.log('📍 [CONSOLE-LAYOUT] Section changed to:', section)
    onNavigateSection?.(section)
    // Auto-close mobile sidebar after selection
    if (open) {
      console.log('📲 [CONSOLE-LAYOUT] Closing mobile sidebar after section change')
      setOpen(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-background via-background to-muted/20 w-full overflow-hidden">
      {/* Mobile Sidebar using shared component (trigger handled by Topbar) */}
      <MobileSidebar showTriggerBar={false}>
        <SidebarMenu
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          statementsEnabled={statementsEnabled}
        />
      </MobileSidebar>

      {/* Desktop Sidebar - fixed left rail on large screens */}
      <aside className="hidden lg:flex">
        <div className="sticky top-0 h-screen overflow-hidden">
          <DesktopSidebar>
            <SidebarMenu
              activeSection={activeSection}
              onSectionChange={handleSectionChange}
              statementsEnabled={statementsEnabled}
            />
          </DesktopSidebar>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar - sticky on mobile for easy access */}
        <Topbar
          activeSection={activeSection}
          activeSectionIndex={activeSectionIndex}
          activeSectionTotal={visibleSectionOrder.length}
        />

        {/* Main Content - optimized scrolling for mobile */}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden bg-background scroll-smooth"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 md:p-8 lg:p-10 xl:p-12">
            <div className="mb-4 hidden lg:flex sticky top-0 z-20 items-center justify-between rounded-2xl border border-border/60 bg-card/85 px-4 py-3 shadow-sm backdrop-blur-md">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{sectionMeta.title}</h2>
                <p className="text-xs text-muted-foreground">{sectionMeta.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="h-7 rounded-full border-border/60 bg-muted/30 px-2 text-[11px]">
                  Section {activeSectionIndex}/{visibleSectionOrder.length}
                </Badge>
                <Badge
                  variant="outline"
                  className={`h-7 rounded-full px-2 text-[11px] ${
                    statementsEnabled === false
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  Statements {statementsEnabled === false ? "Off" : "On"}
                </Badge>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full rounded-2xl border border-border/40 bg-card/60 p-4 sm:p-5 lg:p-6 xl:p-8 shadow-sm backdrop-blur-sm"
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  )
}

export function ConsoleLayout(props: ConsoleLayoutProps) {
  return (
    <Sidebar>
      <ConsoleLayoutInner {...props} />
    </Sidebar>
  )
}
