/**
 * @file components/admin-v2/crm/quick-note-popover.tsx
 * @module admin-v2/crm
 * @description Inline quick-note popover. Used from list rows (Clients table, Compliance
 *              queue, Callback Radar) for rapid note capture without opening Client 360.
 *
 *              Exports:
 *                - default CrmQuickNotePopover — props { userId, trigger? }.
 *
 *              Side-effects: POST on save; cascades cache mutation via createCrmNote.
 *
 *              Read order:
 *                1. Trigger button (default: ghost MessageSquare icon).
 *                2. Popover form: textarea + Save button.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Loader2, MessageSquarePlus } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createCrmNote } from "./hooks"

interface CrmQuickNotePopoverProps {
  userId: string
  trigger?: React.ReactNode
}

export default function CrmQuickNotePopover({ userId, trigger }: CrmQuickNotePopoverProps) {
  const [open, setOpen] = React.useState(false)
  const [body, setBody] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  async function save() {
    const trimmed = body.trim()
    if (!trimmed) return
    setBusy(true)
    setErr(null)
    try {
      await createCrmNote({ userId, body: trimmed })
      setBody("")
      setOpen(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-[var(--v2-text-mute)] transition-colors hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)]"
            aria-label="Quick add note"
            title="Quick add note"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 border-white/[0.08] bg-[var(--v2-bg-elev-1)] p-3 text-[var(--v2-text)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--v2-text-faint)]">
          Quick note
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Short context for the team…  (⌘/Ctrl + Enter to save)"
          className="resize-none border-white/[0.06] bg-white/[0.02] text-sm text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus-visible:border-[var(--v2-border-accent)] focus-visible:ring-0"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault()
              void save()
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          {err ? <span className="text-[11px] text-[#FF8AA0]">{err}</span> : <span />}
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={busy || body.trim().length === 0}
            className="v2-btn-cta"
          >
            {busy ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
