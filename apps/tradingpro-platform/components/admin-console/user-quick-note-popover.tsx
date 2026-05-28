/**
 * @file user-quick-note-popover.tsx
 * @module admin-console
 * @description Lightweight CRM note popover — lets admins jot a quick note on a user from the table row
 *   without opening the full Edit dialog. Calls POST /api/admin/users/[userId]/crm/notes.
 */

"use client"

import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { StickyNote, Loader2, Check } from "lucide-react"

interface UserQuickNotePopoverProps {
  userId: string
  userName?: string
  disabled?: boolean
}

export function UserQuickNotePopover({ userId, userName, disabled }: UserQuickNotePopoverProps) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    const trimmed = note.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/crm/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? "Failed to save note")
      }
      setSaved(true)
      setNote("")
      toast({
        title: "Note saved",
        description: `CRM note added for ${userName ?? "user"}.`,
      })
      setTimeout(() => {
        setSaved(false)
        setOpen(false)
      }, 1000)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message ?? "Could not save note",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-amber-400 transition-colors"
          disabled={disabled}
          title="Add quick CRM note"
        >
          <StickyNote className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="text-xs font-semibold text-foreground mb-2">
          Quick note — {userName ?? "User"}
        </p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Type a CRM note…"
          className="text-xs resize-none h-20 mb-2"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              void handleSave()
            }
          }}
          autoFocus
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">Ctrl+Enter to save</p>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleSave}
            disabled={saving || !note.trim()}
          >
            {saving ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : saved ? (
              <Check className="w-3 h-3 mr-1 text-green-400" />
            ) : (
              <StickyNote className="w-3 h-3 mr-1" />
            )}
            {saved ? "Saved!" : "Save Note"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
