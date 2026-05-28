/**
 * @file kyc-crm-notes-panel.tsx
 * @module admin-console/kyc-queue
 * @description CRM notes list + add (team or manager-only visibility) for the KYC applicant drawer.
 * @author StockTrade
 * @created 2026-04-07
 */

"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { formatDateTime } from "../kyc-types"

export type CrmNoteRow = {
  id: string
  body: string
  isPinned: boolean
  visibility: "TEAM" | "MANAGER_ONLY"
  createdAt: string
  createdBy: { id: string; name: string | null; email: string | null }
}

export function KycCrmNotesPanel({
  userId,
  active,
  onNotesChanged,
}: {
  userId: string
  active: boolean
  onNotesChanged?: () => void
}) {
  const [notes, setNotes] = useState<CrmNoteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState("")
  const [pinned, setPinned] = useState(false)
  const [visibility, setVisibility] = useState<"TEAM" | "MANAGER_ONLY">("TEAM")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/crm/notes?limit=50`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || "Failed to load notes")
      setNotes(Array.isArray(data.notes) ? data.notes : [])
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Notes",
        description: e instanceof Error ? e.message : "Load failed",
      })
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!active || !userId) return
    void load()
  }, [active, userId, load])

  const save = useCallback(async () => {
    const body = draft.trim()
    if (!body) {
      toast({ title: "Note empty", description: "Enter text before saving.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/crm/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, isPinned: pinned, visibility }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || "Save failed")
      setDraft("")
      setPinned(false)
      setVisibility("TEAM")
      toast({ title: "Note saved" })
      await load()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Note save failed",
        description: e instanceof Error ? e.message : "Error",
      })
    } finally {
      setSaving(false)
    }
  }, [draft, pinned, visibility, userId, load, onNotesChanged])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        const el = document.activeElement
        if (el && el.getAttribute("data-crm-note-draft") === "true") {
          e.preventDefault()
          void save()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [active, save])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Notes</p>
        {loading ? <span className="text-[10px] text-muted-foreground">Loading…</span> : null}
      </div>
      <div className="space-y-2 rounded-md border border-border/60 p-2 bg-muted/20">
        <Textarea
          data-crm-note-draft="true"
          placeholder="Call summary, objection, next step… (Ctrl+Enter to save)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[72px] text-xs"
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox id="crm-note-pin" checked={pinned} onCheckedChange={(c) => setPinned(c === true)} />
            <Label htmlFor="crm-note-pin" className="text-[10px] text-muted-foreground cursor-pointer">
              Pin
            </Label>
          </div>
          <div className="flex items-center gap-2 min-w-[140px]">
            <Label className="text-[10px] text-muted-foreground shrink-0">Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as "TEAM" | "MANAGER_ONLY")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TEAM">Team</SelectItem>
                <SelectItem value="MANAGER_ONLY">Manager-only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="sm" className="h-8 text-xs ml-auto" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save note"}
          </Button>
        </div>
      </div>
      <Separator />
      <ul className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
        {notes.map((n) => (
          <li key={n.id} className="text-xs border-b border-border/50 pb-2 last:border-0">
            <div className="flex flex-wrap gap-1 items-center mb-1">
              {n.isPinned ? (
                <Badge variant="secondary" className="text-[9px] h-5">
                  Pinned
                </Badge>
              ) : null}
              <Badge variant="outline" className="text-[9px] h-5">
                {n.visibility === "MANAGER_ONLY" ? "Manager" : "Team"}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {n.createdBy?.name || n.createdBy?.email || n.createdBy?.id} · {formatDateTime(n.createdAt)}
              </span>
            </div>
            <p className="text-foreground whitespace-pre-wrap leading-snug">{n.body}</p>
          </li>
        ))}
        {!loading && notes.length === 0 ? <p className="text-[11px] text-muted-foreground">No notes yet.</p> : null}
      </ul>
    </div>
  )
}
