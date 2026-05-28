/**
 * @file admin-session-provider.tsx
 * @module admin-console
 * @description Provides a reactive, authoritative admin session (user + permissions) for admin-console UI.
 * @author StockTrade
 * @created 2026-01-25
 */

"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

export type AdminUser = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: string
  isActive?: boolean
  clientId?: string | null
}

type AdminSessionState = {
  user: AdminUser | null
  permissions: string[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const AdminSessionContext = createContext<AdminSessionState | null>(null)

type MeResponse =
  | { success: true; user: AdminUser; permissions?: unknown }
  | { success?: false; error?: string; code?: string }

const parsePermissions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string")
}

export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/admin/me", { cache: "no-store" })
      const data = (await response.json()) as MeResponse

      if (!response.ok || !("success" in data) || !data.success) {
        const message =
          "error" in data && typeof data.error === "string" ? data.error : "Failed to load admin session"
        throw new Error(message)
      }

      setUser(data.user)
      const parsedPermissions = parsePermissions(data.permissions)
      setPermissions(parsedPermissions)

      // Optional client cache for legacy components (not authoritative).
      try {
        window.localStorage.setItem("session_user_role", data.user.role)
        window.localStorage.setItem("session_user_permissions", JSON.stringify(parsedPermissions))
      } catch {
        // ignore storage errors
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load admin session"
      setError(message)
      setUser(null)
      setPermissions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<AdminSessionState>(
    () => ({
      user,
      permissions,
      loading,
      error,
      refresh,
    }),
    [user, permissions, loading, error, refresh]
  )

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>
}

export function useAdminSession(): AdminSessionState {
  const ctx = useContext(AdminSessionContext)
  if (!ctx) {
    throw new Error("useAdminSession must be used within AdminSessionProvider")
  }
  return ctx
}

