/**
 * File:        components/trading/AccountMenu.tsx
 * Module:      Trading · Dashboard Header
 * Purpose:     Render the dashboard header's user avatar + dropdown menu. Mirrors
 *              the avatar/image rendering behaviour of /console's topbar so a user
 *              who uploaded a profile picture sees it on the dashboard too, and
 *              provides one-click navigation to every /console section.
 *
 * Exports:
 *   - AccountMenu({ userId }) → JSX.Element  — avatar button that opens a dropdown
 *                                             linking to /console?section=<id>.
 *   - ACCOUNT_MENU_ITEMS                      — ordered config of dropdown entries
 *                                             (label, icon, section | href).
 *
 * Depends on:
 *   - @/lib/hooks/use-console-data — primary source for profile image (session
 *                                    JWT may lag after an avatar upload).
 *   - @/lib/branding-routes        — resolves /console + /contact paths per brand.
 *   - @/components/ui/avatar       — same Radix-based Avatar used by console topbar.
 *   - @/components/ui/dropdown-menu— same Radix dropdown used by console topbar.
 *
 * Side-effects:
 *   - Fires one GET /api/console on mount (via useConsoleData) to fetch the rich
 *     profile (name/email/clientId/image). Session-only data is used as fallback
 *     so the UI renders immediately even before the fetch resolves.
 *   - signOut() clears the NextAuth cookie and redirects to "/".
 *
 * Key invariants:
 *   - `userId` may be undefined during session hydration; useConsoleData treats
 *     undefined as a no-op (no fetch). Avatar still renders via session fallback.
 *   - Menu-item `section` values MUST stay aligned with CONSOLE_SECTION_IDS in
 *     app/(console)/console/page.tsx — otherwise the deep-link parser ignores them.
 *
 * Read order:
 *   1. ACCOUNT_MENU_ITEMS — the dropdown configuration (edit here to add items)
 *   2. AccountMenu        — the component body
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-21
 */

"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import {
  User,
  Settings,
  LogOut,
  LifeBuoy,
  Banknote,
  FileBarChart,
  Landmark,
  LayoutDashboard,
  ArrowDownToLine,
  ShieldCheck,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useConsoleData } from "@/lib/hooks/use-console-data"
import { getAppRoute, getMarketingRoute } from "@/lib/branding-routes"
import { createClientLogger } from "@/lib/logging/client-logger"

const navLog = createClientLogger("MOBILE-NAV:AccountMenu")

function snapshotNavState(extra: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return extra
  return {
    ...extra,
    bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
    htmlPointerEvents: getComputedStyle(document.documentElement).pointerEvents,
    viewportWidth: window.innerWidth,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Dropdown entries, rendered in order. `section` is appended as `?section=` on
 * top of /console; `href` is used verbatim for external/non-console links.
 *
 * NOTE: `section` ids must exist in CONSOLE_SECTION_IDS in the console page
 * (profile, account, statements, deposits, withdrawals, banks, referral,
 *  referral-settings, security). Unknown ids are silently ignored by the
 *  deep-link parser.
 */
export const ACCOUNT_MENU_ITEMS: ReadonlyArray<
  | { label: string; icon: React.ComponentType<{ className?: string }>; section: string }
  | { label: string; icon: React.ComponentType<{ className?: string }>; href: string }
> = [
  { label: "Profile", icon: User, section: "profile" },
  { label: "Console", icon: LayoutDashboard, href: "" /* resolved to /console root */ },
  { label: "Deposits", icon: Banknote, section: "deposits" },
  { label: "Withdrawals", icon: ArrowDownToLine, section: "withdrawals" },
  { label: "Statements", icon: FileBarChart, section: "statements" },
  { label: "Bank Accounts", icon: Landmark, section: "banks" },
  { label: "Security", icon: ShieldCheck, section: "security" },
  { label: "Settings", icon: Settings, section: "security" },
  { label: "Help", icon: LifeBuoy, href: "__contact__" /* resolved to marketing contact */ },
]

interface AccountMenuProps {
  userId: string | undefined
}

/**
 * Resolve a dropdown entry to a concrete href. Centralised so route-helper
 * lookups happen once per render, and so tests can reason about the mapping.
 */
function resolveMenuHref(
  item: (typeof ACCOUNT_MENU_ITEMS)[number],
  consoleRoot: string,
  contactRoute: string,
): string {
  if ("section" in item) return `${consoleRoot}?section=${item.section}`
  if (item.href === "__contact__") return contactRoute
  if (item.href === "") return consoleRoot
  return item.href
}

export function AccountMenu({ userId }: AccountMenuProps) {
  const { data: session } = useSession()
  const { consoleData } = useConsoleData(userId)

  const user = useMemo(() => {
    const sessionUser = session?.user as
      | {
          name?: string | null
          email?: string | null
          clientId?: string | null
          image?: string | null
        }
      | undefined

    const name = consoleData?.user?.name || sessionUser?.name || "User"
    return {
      name,
      email: consoleData?.user?.email || sessionUser?.email || "",
      clientId: consoleData?.user?.clientId || sessionUser?.clientId || "",
      avatarUrl: consoleData?.user?.image ?? sessionUser?.image ?? undefined,
      initials: name
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .join("")
        .toUpperCase()
        .slice(0, 2) || "U",
    }
  }, [session, consoleData])

  const consoleRoot = getAppRoute("consoleRoot")
  const contactRoute = getMarketingRoute("contact")

  const handleLogout = async () => {
    navLog.info("log out clicked", snapshotNavState())
    await signOut({ callbackUrl: "/" })
  }

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) =>
        navLog.info(`dropdown ${open ? "opened" : "closed"}`, snapshotNavState({ userId }))
      }
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-[11px] font-bold uppercase transition-all duration-200 hover:scale-105 hover:border-primary/40 hover:from-primary/30 active:scale-95"
          aria-label="Account menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
            <AvatarFallback className="bg-transparent text-[11px] font-bold uppercase text-primary">
              {user.initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 sm:w-72" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1.5">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            {user.email && (
              <p className="truncate text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
            )}
            {user.clientId && (
              <p className="text-xs leading-none text-muted-foreground">
                ID: {user.clientId}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACCOUNT_MENU_ITEMS.map((item) => {
          const Icon = item.icon
          const href = resolveMenuHref(item, consoleRoot, contactRoute)
          return (
            <DropdownMenuItem key={item.label} asChild className="cursor-pointer">
              <Link
                href={href}
                onClick={() =>
                  navLog.info(`menu item clicked: ${item.label}`, snapshotNavState({ href }))
                }
              >
                <Icon className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
