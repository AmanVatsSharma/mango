"use client"

/**
 * @file user-header-bar.tsx
 * @module admin-console/trades-blotter
 * @description Header shown above the trades table inside a user-scoped tab. Shows the user identity +
 *              quick stats + "View Full Profile" button that reuses the existing UserDetailDrawer.
 * @author StockTrade
 * @created 2026-04-15
 */

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight, User } from "lucide-react"
import { UserDetailDrawer } from "@/components/admin-console/user-detail-drawer"

export interface UserTabContext {
  userId: string
  clientId: string | null
  name: string | null
}

export function UserHeaderBar({ user }: { user: UserTabContext }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">
              {user.name ?? "—"}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {user.clientId ?? user.userId}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => setDrawerOpen(true)}
        >
          View full profile
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>

      <UserDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={{
          id: user.userId,
          name: user.name ?? undefined,
          clientId: user.clientId ?? undefined,
        }}
        onEditClick={() => setDrawerOpen(false)}
        onStatementClick={() => setDrawerOpen(false)}
      />
    </>
  )
}
