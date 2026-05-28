/**
 * @file components/admin-v2/rm/types.ts
 * @module admin-v2/rm
 * @description Shapes for the v2 RM workbench. Mirrors the existing /api/admin/rms,
 *              /api/admin/rms/[rmId]/team, /api/admin/rms/leaderboard responses.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export type RmRole = "MODERATOR" | "ADMIN" | "SUPER_ADMIN"

export interface RmPublicContact {
  displayName?: string | null
  email?: string | null
  phone?: string | null
  whatsappPhone?: string | null
  imageUrl?: string | null
}

export interface RmRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  isActive: boolean
  role: RmRole
  rmPublicContact: RmPublicContact | null
  assignedUsersCount: number
  managedBy: { id: string; name: string | null; email: string | null; role: RmRole } | null
  createdAt: string
}

export interface RmListResp {
  rms: RmRow[]
  total: number
}

export interface RmTeamMember {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  isActive: boolean
  role: "USER"
  createdAt: string
}

export interface RmTeamResp {
  members: RmTeamMember[]
  total: number
}

export interface LeaderboardRow {
  rm: { id: string; name: string | null; email: string | null; role: RmRole; isActive: boolean }
  managedClients: number
  activeClients: number
  approvedKycs: number
  tasksCompleted: number
  tasksOverdueOpen: number
  notesAdded: number
}

export interface LeaderboardResp {
  range: { from: string; to: string }
  rows: LeaderboardRow[]
}
