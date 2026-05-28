/**
 * @file components/admin-v2/rm/rm-org-tree.tsx
 * @module admin-v2/rm
 * @description Hierarchical org-tree view of the RM hierarchy. Built from the same useRmList
 *              data — groups RMs by `managedBy` so the tree forms naturally (root nodes have
 *              no manager). Each node shows the RM, their immediate client count, and an
 *              expand chevron. Lazy team-list expansion (uses useRmTeam on click).
 *
 *              Drag-to-reassign: HTML5 DnD. Drop a leaf node onto another RM to call
 *              assignClientToRm — but Phase 5 does NOT enable this for RM→RM moves (re-parenting
 *              an RM is a structural change with implications); only client-leaf nodes are draggable.
 *              Phase 5 also confirms via window.confirm — Phase 7 polish replaces with a real modal.
 *
 *              Exports:
 *                - default RmOrgTree
 *
 *              Read order:
 *                1. RmOrgTree — top-level; builds the tree.
 *                2. TreeNode — recursive renderer.
 *                3. ClientLeafRow — draggable leaf for RM-managed USER rows.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { ChevronDown, ChevronRight, GripVertical, Users } from "lucide-react"
import { EmptyState, StatusPill } from "@/components/admin-v2/primitives"
import { assignClientToRm, useRmList, useRmTeam } from "./hooks"
import type { RmRow, RmTeamMember } from "./types"

interface TreeNodeData {
  rm: RmRow
  children: TreeNodeData[]
}

function buildForest(rms: RmRow[]): TreeNodeData[] {
  const byParent = new Map<string | null, RmRow[]>()
  for (const rm of rms) {
    const k = rm.managedBy?.id ?? null
    const arr = byParent.get(k) ?? []
    arr.push(rm)
    byParent.set(k, arr)
  }
  function build(parent: string | null): TreeNodeData[] {
    const list = byParent.get(parent) ?? []
    return list.map((rm) => ({ rm, children: build(rm.id) }))
  }
  // Roots = RMs whose manager is not in the RM list (or null).
  const ids = new Set(rms.map((r) => r.id))
  const roots = rms.filter((r) => !r.managedBy || !ids.has(r.managedBy.id))
  return roots.map((rm) => ({ rm, children: build(rm.id) }))
}

export default function RmOrgTree() {
  const list = useRmList()
  const rms = list.data?.rms ?? []
  const forest = React.useMemo(() => buildForest(rms), [rms])

  if (list.isLoading) {
    return (
      <div className="text-sm text-[var(--v2-text-mute)]">Loading hierarchy…</div>
    )
  }
  if (forest.length === 0) {
    return (
      <EmptyState
        title="No RMs to organize"
        description="Add RM-capable users (ADMIN / MODERATOR) before the org tree has anything to show."
      />
    )
  }

  return (
    <div className="v2-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--v2-text)]">RM hierarchy</h3>
        <span className="text-[11px] text-[var(--v2-text-faint)]">
          Drag a client (leaf) onto another RM to reassign · confirm before save
        </span>
      </div>
      <ul className="space-y-1.5">
        {forest.map((node) => (
          <TreeNode key={node.rm.id} node={node} depth={0} />
        ))}
      </ul>
    </div>
  )
}

interface TreeNodeProps {
  node: TreeNodeData
  depth: number
}

function TreeNode({ node, depth }: TreeNodeProps) {
  const [open, setOpen] = React.useState(depth === 0)
  const [showTeam, setShowTeam] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)

  function onRmDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const userId = e.dataTransfer.getData("application/x-v2-user")
    if (!userId) return
    if (
      window.confirm(
        `Reassign this client to ${node.rm.name ?? node.rm.email ?? "this RM"}?`,
      )
    ) {
      void assignClientToRm(userId, node.rm.id)
    }
  }

  return (
    <li>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onRmDrop}
        className={`flex items-center gap-2 rounded-md border bg-white/[0.02] px-2 py-1.5 transition-colors ${
          dragOver
            ? "border-[var(--v2-cobalt)] bg-[var(--v2-cobalt-soft)]"
            : "border-white/[0.06]"
        }`}
        style={{ marginLeft: depth * 16 }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded p-0.5 text-[var(--v2-text-faint)] hover:text-[var(--v2-text)]"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <span className="min-w-0 flex-1">
          <span className="truncate text-sm font-medium text-[var(--v2-text)]">
            {node.rm.name ?? "—"}
          </span>
          <span className="ml-2 text-[11px] text-[var(--v2-text-faint)]">
            {node.rm.email ?? ""}
          </span>
        </span>
        <StatusPill
          tone={node.rm.role === "ADMIN" ? "info" : "neutral"}
          label={node.rm.role}
          size="sm"
        />
        <button
          type="button"
          onClick={() => setShowTeam((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] text-[var(--v2-text-mute)] hover:border-white/[0.16] hover:text-[var(--v2-text)]"
        >
          <Users className="h-3 w-3" />
          <span className="v2-num">{node.rm.assignedUsersCount}</span>
        </button>
      </div>

      {showTeam ? <TeamLeaves rmId={node.rm.id} depth={depth + 1} /> : null}

      {open && node.children.length > 0 ? (
        <ul className="mt-1 space-y-1.5">
          {node.children.map((c) => (
            <TreeNode key={c.rm.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function TeamLeaves({ rmId, depth }: { rmId: string; depth: number }) {
  const team = useRmTeam(rmId)
  const members = team.data?.members ?? []
  if (team.isLoading) {
    return (
      <p
        style={{ marginLeft: depth * 16 }}
        className="px-2 py-1 text-[11px] text-[var(--v2-text-faint)]"
      >
        Loading…
      </p>
    )
  }
  if (members.length === 0) return null
  return (
    <ul className="mt-1 space-y-1" style={{ marginLeft: depth * 16 }}>
      {members.map((m) => (
        <ClientLeafRow key={m.id} member={m} />
      ))}
    </ul>
  )
}

function ClientLeafRow({ member }: { member: RmTeamMember }) {
  function onDragStart(e: React.DragEvent<HTMLLIElement>) {
    e.dataTransfer.setData("application/x-v2-user", member.id)
    e.dataTransfer.effectAllowed = "move"
  }
  return (
    <li
      draggable
      onDragStart={onDragStart}
      className="flex cursor-grab items-center gap-2 rounded-md border border-white/[0.04] bg-white/[0.01] px-2 py-1 text-xs text-[var(--v2-text)] active:cursor-grabbing"
      title="Drag onto another RM to reassign"
    >
      <GripVertical className="h-3 w-3 text-[var(--v2-text-faint)]" />
      <span className="min-w-0 flex-1 truncate">
        {member.name ?? "—"}
      </span>
      <span className="font-mono text-[10px] text-[var(--v2-text-faint)]">
        {member.clientId ?? member.email ?? member.id.slice(0, 8)}
      </span>
      {!member.isActive ? <StatusPill kind="INACTIVE" size="sm" /> : null}
    </li>
  )
}
