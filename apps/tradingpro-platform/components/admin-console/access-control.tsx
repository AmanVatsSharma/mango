/**
 * File: components/admin-console/access-control.tsx
 * Module: admin-console
 * Purpose: Manage role permissions for the admin console.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Reads configuration from /api/admin/access-control.
 * - Start with `loadAccessControl` for API shape.
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Shield, RefreshCw, Save, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, RefreshButton } from "./shared"
import { toast } from "@/hooks/use-toast"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"

type RoleKey = "USER" | "MODERATOR" | "ADMIN" | "SUPER_ADMIN"

type PermissionDefinition = {
  key: string
  label: string
  description: string
  category: string
  risk: "low" | "medium" | "high"
}

type RbacConfig = {
  roles: Record<RoleKey, string[]>
  updatedAt: string
  updatedBy?: { id?: string; name?: string | null; email?: string | null }
}

const ROLE_ORDER: RoleKey[] = ["MODERATOR", "ADMIN", "SUPER_ADMIN"]

const normalizeRoles = (roles: Record<RoleKey, string[]>) =>
  Object.entries(roles).reduce((acc, [role, permissions]) => {
    acc[role as RoleKey] = Array.from(new Set(permissions)).sort()
    return acc
  }, {} as Record<RoleKey, string[]>)

// Client-side convenience check for role permissions.
const hasPermission = (rolePermissions: Record<RoleKey, string[]>, role: RoleKey, key: string) =>
  rolePermissions[role]?.includes(key) || false

const riskBadgeStyles: Record<PermissionDefinition["risk"], string> = {
  low: "bg-green-500/15 text-green-400 border-green-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  high: "bg-red-500/15 text-red-400 border-red-500/30",
}

export function AccessControl() {
  const { refresh: refreshSession } = useAdminSession()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accessDenied, setAccessDenied] = useState<{ status: number; message: string } | null>(null)
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([])
  const [restrictedPermissions, setRestrictedPermissions] = useState<
    Record<string, RoleKey[]>
  >({})
  const [rolePermissions, setRolePermissions] = useState<Record<RoleKey, string[]>>({
    USER: [],
    MODERATOR: [],
    ADMIN: [],
    SUPER_ADMIN: [],
  })
  const [originalRoles, setOriginalRoles] = useState<Record<RoleKey, string[]>>({
    USER: [],
    MODERATOR: [],
    ADMIN: [],
    SUPER_ADMIN: [],
  })
  const [defaults, setDefaults] = useState<Record<RoleKey, string[]>>({
    USER: [],
    MODERATOR: [],
    ADMIN: [],
    SUPER_ADMIN: [],
  })
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [source, setSource] = useState<"db" | "default">("default")
  const [canManage, setCanManage] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)

  // Derive available categories to filter the table.
  const categories = useMemo(() => {
    const values = new Set(permissions.map((permission) => permission.category))
    return ["all", ...Array.from(values)]
  }, [permissions])

  // Apply search + category filters to permissions list.
  const filteredPermissions = useMemo(() => {
    return permissions.filter((permission) => {
      const matchesCategory = categoryFilter === "all" || permission.category === categoryFilter
      const matchesSearch =
        permission.label.toLowerCase().includes(search.toLowerCase()) ||
        permission.key.toLowerCase().includes(search.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [permissions, categoryFilter, search])

  // Compare current roles to original state for dirty detection.
  const isDirty = useMemo(() => {
    const normalized = normalizeRoles(rolePermissions)
    const normalizedOriginal = normalizeRoles(originalRoles)
    return JSON.stringify(normalized) !== JSON.stringify(normalizedOriginal)
  }, [rolePermissions, originalRoles])

  // Load access control catalog and role-permission mapping.
  const loadAccessControl = async () => {
    setLoading(true)
    setAccessDenied(null)
    try {
      const response = await fetch("/api/admin/access-control")
      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.success) {
        if (response.status === 401 || response.status === 403) {
          setAccessDenied({
            status: response.status,
            message: data?.error || "You are not authorized to view access control.",
          })
          // Clear view state to avoid showing stale data.
          setPermissions([])
          return
        }
        throw new Error(data.error || "Failed to load access control")
      }

      const normalizedConfig = normalizeRoles(data.config.roles || {})
      setPermissions(data.permissions || [])
      setRolePermissions(normalizedConfig)
      setOriginalRoles(normalizedConfig)
      setDefaults(normalizeRoles(data.defaults || {}))
      setSource(data.source || "default")
      setCanManage(Boolean(data.canManage))
      setRestrictedPermissions(data.restrictedPermissions || {})
      setUpdatedAt(data.config?.updatedAt || null)
      const updater = data.config?.updatedBy
      setUpdatedBy(updater?.name || updater?.email || updater?.id || null)
    } catch (error: any) {
      toast({
        title: "Failed to load access control",
        description: error.message || "Unable to load role permissions",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccessControl()
  }, [])

  // Toggle a specific permission for a role.
  const togglePermission = (role: RoleKey, key: string) => {
    if (!canManage || isPermissionLocked(role, key)) return
    setRolePermissions((prev) => {
      const existing = new Set(prev[role] || [])
      if (existing.has(key)) {
        existing.delete(key)
      } else {
        existing.add(key)
      }
      return {
        ...prev,
        [role]: Array.from(existing),
      }
    })
  }

  // Prevent assigning restricted permissions to disallowed roles.
  const isPermissionLocked = (role: RoleKey, key: string) => {
    const restrictedRoles = restrictedPermissions[key]
    if (restrictedRoles && !restrictedRoles.includes(role)) return true
    if (role !== "SUPER_ADMIN") return false
    return key === "admin.all" || key === "admin.access-control.manage"
  }

  // Persist updated role-permission mapping.
  const handleSave = async () => {
    if (!canManage || !isDirty) return
    setSaving(true)
    try {
      const response = await fetch("/api/admin/access-control", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: rolePermissions }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        if (response.status === 401 || response.status === 403) {
          setAccessDenied({
            status: response.status,
            message: data?.error || "You are not authorized to update access control.",
          })
          return
        }
        throw new Error(data.error || "Failed to update access control")
      }
      const normalizedConfig = normalizeRoles(data.config.roles || {})
      setRolePermissions(normalizedConfig)
      setOriginalRoles(normalizedConfig)
      setUpdatedAt(data.config?.updatedAt || null)
      const updater = data.config?.updatedBy
      setUpdatedBy(updater?.name || updater?.email || updater?.id || null)
      toast({
        title: "✅ Access control updated",
        description: "Role permissions saved successfully.",
      })
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message || "Unable to save permissions",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  // Reset to defaults locally (requires save to persist).
  const handleReset = async () => {
    if (!canManage) return
    setRolePermissions(defaults)
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      <PageHeader
        title="Access Control"
        description="Manage role permissions for the admin console"
        icon={<Shield className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton onClick={loadAccessControl} loading={loading} size="sm" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!canManage}
              className="border-primary/50 text-primary hover:bg-primary/10 bg-transparent"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset Defaults
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!canManage || !isDirty || saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        }
      />

      {accessDenied && (
        <Alert className="bg-red-500/10 border-red-500/40">
          <ShieldCheck className="h-4 w-4 text-red-400" />
          <AlertTitle className="text-red-400">
            {accessDenied.status === 401 ? "Unauthorized" : "Forbidden"}
          </AlertTitle>
          <AlertDescription className="text-red-400/80">
            {accessDenied.message} If your permissions were just updated, refresh your session.
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/40 text-red-300 hover:bg-red-500/10 bg-transparent"
                onClick={() => refreshSession()}
              >
                Refresh Session
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-border text-foreground hover:bg-muted bg-transparent"
                onClick={() => loadAccessControl()}
              >
                Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {source === "default" && (
        <Alert className="bg-yellow-500/10 border-yellow-500/50">
          <ShieldCheck className="h-4 w-4 text-yellow-500" />
          <AlertTitle className="text-yellow-500">Default Configuration Active</AlertTitle>
          <AlertDescription className="text-yellow-500/80">
            No custom RBAC configuration saved yet. Save changes to persist settings.
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-card border-border shadow-sm neon-border">
        <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6 space-y-2">
          <CardTitle className="text-lg sm:text-xl font-bold text-primary">
            Role Permission Matrix
          </CardTitle>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search permissions..."
              className="bg-muted/50 border-border focus:border-primary"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="bg-background border-border sm:w-48">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category === "all" ? "All Categories" : category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Last updated: {updatedAt ? new Date(updatedAt).toLocaleString() : "N/A"}
            {updatedBy ? ` by ${updatedBy}` : ""}
          </p>
        </CardHeader>
        <CardContent className="px-0 sm:px-6 pb-3 sm:pb-6">
          {loading ? (
            <div className="text-center py-10 text-muted-foreground">Loading access control...</div>
          ) : (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <div className="min-w-[720px] sm:min-w-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground">Permission</TableHead>
                      {ROLE_ORDER.map((role) => (
                        <TableHead key={role} className="text-muted-foreground text-center">
                          {role.replace("_", " ")}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPermissions.map((permission) => (
                      <TableRow key={permission.key} className="border-border">
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{permission.label}</span>
                              <Badge className={riskBadgeStyles[permission.risk]}>
                                {permission.risk.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{permission.description}</p>
                            <p className="text-xs text-muted-foreground font-mono">{permission.key}</p>
                          </div>
                        </TableCell>
                        {ROLE_ORDER.map((role) => (
                          <TableCell key={`${role}-${permission.key}`} className="text-center">
                            <Checkbox
                              checked={hasPermission(rolePermissions, role, permission.key)}
                              onCheckedChange={() => togglePermission(role, permission.key)}
                              disabled={!canManage || isPermissionLocked(role, permission.key)}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {filteredPermissions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={ROLE_ORDER.length + 1} className="text-center py-10">
                          <p className="text-muted-foreground">No permissions match your filters.</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

