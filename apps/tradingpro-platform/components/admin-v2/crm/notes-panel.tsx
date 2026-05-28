/**
 * @file components/admin-v2/crm/notes-panel.tsx
 * @module admin-v2/crm
 * @description Canonical CRM notes panel for v2 — used by Client 360 CRM tab + Compliance
 *              Workbench drawer. Replaces the inline notes block previously in
 *              client-360/tabs/crm.tsx and the v1 kyc-crm-notes-panel.tsx (left untouched).
 *
 *              Exports:
 *                - default CrmNotesPanel  — props { userId, dense? }.
 *
 *              Side-effects: SWR fetch of /api/admin/users/[userId]/crm/notes (30s refresh).
 *              POST on add. Cache mutation via mutateCrmCachesForUser.
 *
 *              Key invariants:
 *                - Pinned notes always render first; thereafter newest first.
 *                - Visibility toggle (TEAM/MANAGER_ONLY) gated server-side; UI shows both
 *                  options regardless of role (server enforces).
 *                - Ctrl/Cmd+Enter saves.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Loader2, Pin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, StatusPill } from "@/components/admin-v2/primitives"
import { formatRelativeIst } from "@/lib/admin-v2/api-client"
import { createCrmNote, useCrmNotes } from "./hooks"
import type { CrmNoteVisibility } from "./types"

interface CrmNotesPanelProps {
  userId: string
  dense?: boolean
}

export default function CrmNotesPanel({ userId, dense = false }: CrmNotesPanelProps) {
  const { data, isLoading, error, mutate } = useCrmNotes(userId)
  const notes = data?.notes ?? []

  const [draft, setDraft] = React.useState("")
  const [isPinned, setIsPinned] = React.useState(false)
  const [visibility, setVisibility] = React.useState<CrmNoteVisibility>("TEAM")
  const [submitting, setSubmitting] = React.useState(false)
  const [submitErr, setSubmitErr] = React.useState<string | null>(null)

  async function save() {
    const body = draft.trim()
    if (!body) return
    setSubmitting(true)
    setSubmitErr(null)
    try {
      await createCrmNote({ userId, body, isPinned, visibility })
      setDraft("")
      setIsPinned(false)
      setVisibility("TEAM")
      await mutate()
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="v2-card flex flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <h3 className="text-sm font-semibold text-[var(--v2-text)]">Notes</h3>
        <span className="text-[11px] text-[var(--v2-text-faint)]">
          <span className="v2-num text-[var(--v2-text-mute)]">{notes.length}</span> total
        </span>
      </header>

      <div className="space-y-2 border-b border-white/[0.06] p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={dense ? 2 : 3}
          placeholder="Add a note…  (⌘/Ctrl + Enter to save)"
          className="resize-none border-white/[0.06] bg-white/[0.03] text-sm text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus-visible:border-[var(--v2-border-accent)] focus-visible:ring-0"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault()
              void save()
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsPinned((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                isPinned
                  ? "border-amber-500/40 bg-amber-500/10 text-[#FFCB66]"
                  : "border-white/[0.08] bg-white/[0.02] text-[var(--v2-text-mute)] hover:border-white/[0.16]"
              }`}
              aria-pressed={isPinned}
            >
              <Pin className="h-3 w-3" /> {isPinned ? "Pinned" : "Pin"}
            </button>
            <button
              type="button"
              onClick={() =>
                setVisibility((v) => (v === "TEAM" ? "MANAGER_ONLY" : "TEAM"))
              }
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-[11px] font-medium text-[var(--v2-text-mute)] hover:border-white/[0.16]"
            >
              {visibility === "MANAGER_ONLY" ? "Manager only" : "Team"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {submitErr ? (
              <span className="text-[11px] text-[#FF8AA0]">{submitErr}</span>
            ) : null}
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={submitting || draft.trim().length === 0}
              className="v2-btn-cta"
            >
              {submitting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className={`overflow-y-auto p-3 ${dense ? "max-h-[260px]" : "max-h-[420px]"}`}>
        {isLoading ? (
          <p className="text-xs text-[var(--v2-text-mute)]">Loading notes…</p>
        ) : error ? (
          <p className="text-xs text-[#FF8AA0]">Failed to load notes.</p>
        ) : notes.length === 0 ? (
          <EmptyState title="No notes yet" description="Add the first note above." />
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  {n.isPinned ? <StatusPill tone="warning" label="Pinned" size="sm" /> : null}
                  {n.visibility === "MANAGER_ONLY" ? (
                    <StatusPill tone="info" label="Manager only" size="sm" />
                  ) : null}
                  <span className="ml-auto text-[11px] text-[var(--v2-text-faint)]">
                    {formatRelativeIst(n.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-[var(--v2-text)]">{n.body}</p>
                <p className="mt-1.5 text-[11px] text-[var(--v2-text-faint)]">
                  {n.createdBy?.name ?? n.createdBy?.email ?? "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
