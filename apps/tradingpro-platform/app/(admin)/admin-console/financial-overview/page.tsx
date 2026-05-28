/**
 * @file page.tsx
 * @module admin-console/financial-overview
 * @description Financial Overview page (Super Admin only)
 * @author StockTrade
 * @created 2025-01-27
 */

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FinancialOverview } from "@/components/admin-console/financial-overview"
import { Dashboard } from "@/components/admin-console/dashboard"
import { getAdminConsoleRoute } from "@/lib/branding-routes"

export default function FinancialOverviewPage() {
  const [role, setRole] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    try {
      const r = window.localStorage.getItem('session_user_role')
      if (r) {
        setRole(r)
        if (r !== 'SUPER_ADMIN') {
          router.push(getAdminConsoleRoute())
        }
      }
    } catch {}
  }, [router])

  if (role !== 'SUPER_ADMIN') {
    return <Dashboard />
  }

  return <FinancialOverview />
}
