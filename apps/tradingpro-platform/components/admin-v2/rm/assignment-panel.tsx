/**
 * @file components/admin-v2/rm/assignment-panel.tsx
 * @module admin-v2/rm
 * @description Reusable RM-assignment panel — picks an RM from the list and assigns the given
 *              client to them. Shared by the Roster, Org tree, Client 360 (Overview tab inline
 *              edit), and the unassigned-clients queue.
 *
 *              Exports:
 *                - default RmAssignmentPanel  — props { userId, currentRmId?, onAssigned? }.
 *
 *              Side-effects: PATCH /api/admin/users/[userId]/assign-rm via assignClientToRm().
 *
 *              Read order:
 *                1. RmAssignmentPanel — top-level dropdown + confirm.
 *                2. RmOption row — shows RM name, role, and current load (managedClients).
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { assignClientToRm, useRmList } from "./hooks"

interface RmAssignmentPanelProps {
  userId: string
  currentRmId?: string | null
  /** When non-null, fires after a successful assignment. */
  onAssigned?: (newRmId: string | null) => void
  compact?: boolean
}

const UNASSIGN_VALUE = "__unassign__"

export default function RmAssignmentPanel({
  userId,
  currentRmId,
  onAssigned,
  compact = false,
}: RmAssignmentPanelProps) {
  const list = useRmList()
  const rms = list.data?.rms ?? []
  const [selected, setSelected] = React.useState<string>(currentRmId ?? UNASSIGN_VALUE)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  React.useEffect(() => {
    setSelected(currentRmId ?? UNASSIGN_VALUE)
  }, [currentRmId])

  const dirty = selected !== (currentRmId ?? UNASSIGN_VALUE)

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const target = selected === UNASSIGN_VALUE ? null : selected
      await assignClientToRm(userId, target)
      onAssigned?.(target)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={compact ? "flex items-center gap-2" : "v2-card p-3"}>
      <div className={compact ? "flex-1" : "mb-2"}>
        {!compact ? (
          <label className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            Relationship Manager
          </label>
        ) : null}
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="border-white/[0.08] bg-white/[0.03] text-sm text-[var(--v2-text)]">
            <SelectValue
              placeholder={list.isLoading ? "Loading…" : "Pick an RM"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-wide">
                Assignment
              </SelectLabel>
              <SelectItem value={UNASSIGN_VALUE}>— Unassign —</SelectItem>
              <SelectLabel className="mt-1 text-[10px] uppercase tracking-wide">
                Available RMs
              </SelectLabel>
              {rms
                .filter((r) => r.isActive)
                .map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="flex items-center justify-between gap-3">
                      <span>
                        {r.name ?? r.email ?? r.id.slice(0, 8)}{" "}
                        <span className="text-[10px] text-[var(--v2-text-faint)]">
                          {r.role}
                        </span>
                      </span>
                      <span className="text-[10px] text-[var(--v2-text-faint)]">
                        {r.assignedUsersCount} clients
                      </span>
                    </span>
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className={compact ? "" : "flex items-center justify-between gap-2"}>
        {err ? <span className="text-[11px] text-[#FF8AA0]">{err}</span> : null}
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={!dirty || busy}
          className="v2-btn-cta"
        >
          {busy ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
          {dirty ? "Save" : "Saved"}
        </Button>
      </div>
    </div>
  )
}
