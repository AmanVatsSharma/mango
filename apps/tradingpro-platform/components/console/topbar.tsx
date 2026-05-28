"use client"

/**
 * @file topbar.tsx
 * @module components/console
 * @description Console top navigation bar with user context, market status, and theme/action controls.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-06 — Avatar from session or console payload.
 */

import { ArrowLeft, Menu, Settings, User, LogOut, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar"
import { ThemeToggle } from "./theme-toggle"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { useSession, signOut } from "next-auth/react"
import { useConsoleData } from "@/lib/hooks/use-console-data"
import { useEffect, useMemo, useState } from "react"
import { getMarketSession } from "@/lib/hooks/market-timing"
import { formatTimeIST, getCurrentISTDate } from "@/lib/date-utils"
import Link from "next/link"
import { getAppRoute } from "@/lib/branding-routes"

import { useSidebar } from "@/components/ui/sidebar"

interface TopbarProps {
  activeSection?: string
  activeSectionIndex?: number
  activeSectionTotal?: number
}

const SECTION_LABELS: Record<string, string> = {
  profile: "Profile Workspace",
  account: "Account Workspace",
  statements: "Statements Workspace",
  deposits: "Deposits Workspace",
  withdrawals: "Withdrawals Workspace",
  banks: "Bank Accounts Workspace",
  security: "Security Workspace",
}

export function Topbar({
  activeSection = "account",
  activeSectionIndex,
  activeSectionTotal,
}: TopbarProps) {
  const { open, setOpen } = useSidebar()

  // Get real user data
  const { data: session } = useSession()
  const userId = (session?.user as { id?: string })?.id as string | undefined
  const { consoleData } = useConsoleData(userId)

  // Extract user info
  const user = useMemo(() => {
    const sessionUser = session?.user as {
      name?: string | null
      email?: string | null
      phone?: string | null
      clientId?: string | null
      image?: string | null
    } | undefined
    return {
      name: consoleData?.user?.name || sessionUser?.name || 'User',
      email: consoleData?.user?.email || sessionUser?.email || '',
      phone: consoleData?.user?.phone || sessionUser?.phone || '',
      clientId: consoleData?.user?.clientId || sessionUser?.clientId || '',
      avatarUrl: consoleData?.user?.image ?? sessionUser?.image ?? undefined,
      initials: (consoleData?.user?.name || sessionUser?.name || 'U')
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
  }, [session, consoleData])

  // Centralized market status in IST (open/pre-open/closed) with periodic refresh
  const [marketStatus, setMarketStatus] = useState<{isOpen: boolean; label: string}>(() => {
    const session = getMarketSession()
    return { isOpen: session === 'open', label: session === 'open' ? 'Market Open' : session === 'pre-open' ? 'Pre-Open' : 'Market Closed' }
  })
  useEffect(() => {
    const t = setInterval(() => {
      const session = getMarketSession()
      setMarketStatus({ isOpen: session === 'open', label: session === 'open' ? 'Market Open' : session === 'pre-open' ? 'Pre-Open' : 'Market Closed' })
    }, 15000)
    return () => clearInterval(t)
  }, [])

  // Keep a ticking IST clock (optional use)
  const [currentTime, setCurrentTime] = useState<Date>(getCurrentISTDate())
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(getCurrentISTDate()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleLogout = async () => {
    console.log('🚪 [TOPBAR] User logging out')
    await signOut({ callbackUrl: '/' })
  }

  const activeSectionLabel = SECTION_LABELS[activeSection] || SECTION_LABELS.account
  const activeSectionProgress =
    typeof activeSectionIndex === "number" && typeof activeSectionTotal === "number"
      ? `${activeSectionIndex}/${activeSectionTotal}`
      : null
  const dashboardRoute = getAppRoute("dashboard")

  return (
    <header className="sticky top-0 z-40 h-14 sm:h-16 lg:h-[72px] bg-card/95 backdrop-blur-md border-b border-border flex items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8 shadow-sm">
      {/* Left Section */}
      <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
        {/* Menu Toggle Button for Mobile */}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => {
            console.log('🍔 [TOPBAR] Menu button clicked')
            setOpen(!open)
          }}
          className="lg:hidden h-9 w-9 p-0 hover:bg-accent"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </Button>

        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2 sm:px-3 hover:bg-accent shrink-0"
        >
          <Link href={dashboardRoute} aria-label="Back to dashboard">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden md:inline text-xs sm:text-sm">Back to Dashboard</span>
          </Link>
        </Button>

        {/* Title - Hidden on small mobile */}
        <div className="hidden sm:block min-w-0">
          <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground truncate">
            Trading Console
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            Welcome back, {user.name.split(' ')[0]}
          </p>
        </div>

        {/* Mobile Title - Shown only on small screens */}
        <div className="sm:hidden">
          <h2 className="text-sm font-semibold text-foreground">Console</h2>
        </div>

        <div className="hidden lg:flex items-center rounded-full border border-border/60 bg-muted/35 px-3 py-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{activeSectionLabel}</span>
          {activeSectionProgress && (
            <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {activeSectionProgress}
            </span>
          )}
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
        {/* Market Status - Hidden on mobile */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
          <div className={`w-2 h-2 rounded-full ${marketStatus.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs font-medium text-muted-foreground">{marketStatus.label}</span>
        </div>

        {/* IST Time - Desktop only */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40 text-xs text-muted-foreground">
          <span className="font-medium">IST</span>
          <span className="font-mono text-foreground">{formatTimeIST(currentTime)}</span>
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <NotificationBell userId={userId} />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="relative h-9 w-9 rounded-full p-0 hover:bg-accent"
              aria-label="User menu"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
                <AvatarFallback className="text-xs sm:text-sm font-semibold">
                  {user.initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64 sm:w-72" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1.5">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                <p className="text-xs leading-none text-muted-foreground truncate">
                  {user.email}
                </p>
                {user.clientId && (
                  <p className="text-xs leading-none text-muted-foreground">
                    ID: {user.clientId}
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive cursor-pointer focus:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
