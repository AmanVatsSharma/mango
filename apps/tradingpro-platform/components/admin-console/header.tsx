/**
 * File:        components/admin-console/header.tsx
 * Module:      admin-console · Header
 * Purpose:     Sticky header bar for the admin console — search, notifications, theme toggle,
 *              user profile chip, and a role-gated shortcut to the admin-v2 shell.
 *
 * Exports:
 *   - Header({ onQRScannerOpen, onMobileMenuToggle }) — the header component
 *
 * Depends on:
 *   - useAdminSession — provides role for admin-v2 visibility gate
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - The "Go to Admin v2" button is a UX hint only; real access control lives in the
 *     admin-v2 layout's server-side isAdminV2Allowed() guard.
 *   - Visible to ADMIN, SUPER_ADMIN, MODERATOR (≡ RM); hidden for USER role.
 *
 * Read order:
 *   1. HeaderProps — prop shape
 *   2. Header — main render, admin-v2 button gating
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-01
 */

"use client"

import { motion } from "framer-motion"
import { Search, Settings, User, Menu, QrCode, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { toast } from "@/hooks/use-toast"
import { AdminNotificationBell } from "./admin-notification-bell"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"
import { ThemeToggle } from "@/components/console/theme-toggle"

const ADMIN_V2_ROLES = ["ADMIN", "SUPER_ADMIN", "MODERATOR"] as const

interface HeaderProps {
  onQRScannerOpen: () => void
  onMobileMenuToggle: () => void
}

export function Header({ onQRScannerOpen, onMobileMenuToggle }: HeaderProps) {
  const { user: adminUser, loading, error } = useAdminSession()
  const canAccessAdminV2 = !loading && !!adminUser && (ADMIN_V2_ROLES as readonly string[]).includes(adminUser.role)

  // Surface session load errors in a user-friendly way.
  useEffect(() => {
    if (!error) return
    toast({
      title: "⚠️ Warning",
      description: error,
      variant: "destructive",
    })
  }, [error])

  return (
    <motion.header
      className="glass-surface border-b border-border p-2 sm:p-3 md:p-4"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center space-x-2 sm:space-x-4 flex-1 min-w-0">
          {/* Mobile Menu Button */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="md:hidden flex-shrink-0 touch-manipulation" 
            onClick={onMobileMenuToggle}
            aria-label="Toggle mobile menu"
          >
            <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>

          {/* Search - Hidden on small screens, shown on medium+ */}
          <div className="relative flex-1 max-w-md hidden sm:block min-w-0">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users, transactions, logs..."
              className="pl-8 sm:pl-10 bg-muted/50 border-border focus:border-primary text-sm"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
          <Button 
            variant="ghost" 
            size="sm" 
            className="hidden md:flex touch-manipulation" 
            onClick={onQRScannerOpen}
            aria-label="Open QR Scanner"
          >
            <QrCode className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="sm:hidden touch-manipulation"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </Button>

          {canAccessAdminV2 && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium border-primary/30 text-primary hover:bg-primary/10 touch-manipulation"
              aria-label="Go to Admin v2"
            >
              <Link href="/admin-v2">
                Admin v2
                <ExternalLink className="w-3 h-3" />
              </Link>
            </Button>
          )}

          <AdminNotificationBell />

          <ThemeToggle />

          <Button 
            variant="ghost" 
            size="sm" 
            className="hidden sm:flex touch-manipulation"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </Button>

          {/* Admin User Profile */}
          <div className="flex items-center space-x-1 sm:space-x-2 pl-1 sm:pl-2 border-l border-border">
            {loading ? (
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary/50 rounded-full animate-pulse flex-shrink-0"></div>
            ) : adminUser?.image ? (
              <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden border-2 border-primary/50 flex-shrink-0">
                <Image 
                  src={adminUser.image} 
                  alt={adminUser.name || 'Admin'} 
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-3 h-3 sm:w-4 sm:h-4 text-primary-foreground" />
              </div>
            )}
            <div className="text-xs sm:text-sm hidden sm:block min-w-0">
              <p className="font-medium truncate max-w-[120px] lg:max-w-none">
                {loading ? 'Loading...' : adminUser?.name || adminUser?.email || 'Admin User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {loading
                  ? '...'
                  : adminUser?.role === 'SUPER_ADMIN'
                    ? 'Super Admin'
                    : adminUser?.role === 'ADMIN'
                      ? 'Admin'
                      : 'Moderator'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  )
}
