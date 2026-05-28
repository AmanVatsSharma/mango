/**
 * @file kyc-crm-tasks-panel.tsx
 * @module admin-console/kyc-queue
 * @description CRM tasks: callbacks and follow-ups with presets, snooze, and status actions.
 * @author StockTrade
 * @created 2026-04-07
 */

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { formatDateTime } from "../kyc-types"
import { cn } from "@/lib/utils"

export type CrmTaskRow = {
  id: string
  title: string
  description: string | null
  kind: string
  status: string
  priority: string
  dueAt: string | null
  snoozeCount: number
  disposition: string | null
  outcomeNote: string | null
  createdAt: string
  createdBy: { id: string; name: string | null; email: string | null }
  completedBy: { id: string; name: string | null; email: string | null } | null
}

const KINDS = [
  { label: "Callback", value: "CALLBACK" },
  { label: "Follow-up", value: "FOLLOW_UP" },
  { label: "Document", value: "DOCUMENT" },
  { label: "Other", value: "OTHER" },
] as const

function isoFromOffsetMs(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

export function KycCrmTasksPanel({
  userId,
  active,
  onTasksChanged,
}: {
  userId: string
  active: boolean
  onTasksChanged?: () => void
}) {
  const [tasks, setTasks] = useState<CrmTaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [bucket, setBucket] = useState<"active" | "done">("active")
  const [upcoming, setUpcoming] = useState(true)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [kind, setKind] = useState<string>("CALLBACK")
  const [dueAt, setDueAt] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const query = useMemo(() => {
    const q = new URLSearchParams()
    q.set("status", bucket)
    if (bucket === "active" && upcoming) q.set("upcoming", "1")
    return q.toString()
  }, [bucket, upcoming])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/crm/tasks?${query}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || "Failed to load tasks")
      setTasks(Array.isArray(data.tasks) ? data.tasks : [])
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Tasks",
        description: e instanceof Error ? e.message : "Load failed",
      })
    } finally {
      setLoading(false)
    }
  }, [userId, query])

  useEffect(() => {
    if (!active || !userId) return
    void load()
  }, [active, userId, load])

  const refresh = useCallback(async () => {
    await load()
    onTasksChanged?.()
  }, [load, onTasksChanged])

  const createTask = useCallback(
    async (payload: Record<string, unknown>) => {
      setSubmitting(true)
      try {
        const res = await fetch(`/api/admin/users/${userId}/crm/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.message || data?.error || "Create failed")
        toast({ title: "Task created" })
        setTitle("")
        setDescription("")
        setDueAt("")
        await refresh()
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Task",
          description: e instanceof Error ? e.message : "Error",
        })
      } finally {
        setSubmitting(false)
      }
    },
    [userId, refresh],
  )

  const patchTask = useCallback(
    async (taskId: string, payload: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/admin/users/${userId}/crm/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.message || data?.error || "Update failed")
        await refresh()
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Task update",
          description: e instanceof Error ? e.message : "Error",
        })
      }
    },
    [userId, refresh],
  )

  const applyPresetDue = (ms: number) => {
    const d = new Date(Date.now() + ms)
    const pad = (n: number) => String(n).padStart(2, "0")
    setDueAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
  }

  const submitNew = () => {
    const t = title.trim()
    if (!t) {
      toast({ variant: "destructive", title: "Title required" })
      return
    }
    void createTask({
      title: t,
      description: description.trim() || undefined,
      kind,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
    })
  }

  const nowMs = Date.now()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Tasks & callbacks</p>
        {loading ? <span className="text-[10px] text-muted-foreground">Loading…</span> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[10px]"
          onClick={() =>
            void createTask({
              title: "No answer — retry",
              kind: "CALLBACK",
              disposition: "NO_ANSWER",
              dueAt: isoFromOffsetMs(24 * 3600 * 1000),
            })
          }
        >
          No answer (+24h)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[10px]"
          onClick={() =>
            void createTask({
              title: "Spoke — follow-up",
              kind: "FOLLOW_UP",
              disposition: "SPOKE_FOLLOWUP",
              dueAt: isoFromOffsetMs(48 * 3600 * 1000),
            })
          }
        >
          Spoke — follow-up (+48h)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[10px]"
          onClick={() =>
            void (async () => {
              const res = await fetch(`/api/admin/users/${userId}/crm/tasks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: "Wrong number",
                  kind: "OTHER",
                  disposition: "WRONG_NUMBER",
                }),
              })
              const data = await res.json().catch(() => ({}))
              if (!res.ok || !data.task?.id) {
                toast({ variant: "destructive", title: "Task", description: data?.error || "Failed" })
                return
              }
              await patchTask(data.task.id, { status: "DONE", outcomeNote: "Wrong number recorded" })
            })()
          }
        >
          Wrong #
        </Button>
      </div>

      <div className="rounded-md border border-border/60 p-2 space-y-2 bg-muted/20">
      <p className="text-[10px] font-medium text-muted-foreground">New task</p>
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" data-crm-task-title="true" />
        <Textarea placeholder="Details (optional)" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[48px] text-xs" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Due (device local)</Label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => applyPresetDue(15 * 60 * 1000)}>
            +15m
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => applyPresetDue(60 * 60 * 1000)}>
            +1h
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => applyPresetDue(24 * 60 * 60 * 1000)}>
            +24h
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => applyPresetDue(48 * 60 * 60 * 1000)}>
            +48h
          </Button>
          <Button type="button" size="sm" className="h-7 text-[10px] ml-auto" disabled={submitting} onClick={() => void submitNew()}>
            Create
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={bucket} onValueChange={(v) => setBucket(v as "active" | "done")}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Open</SelectItem>
            <SelectItem value="done">Done / cancelled</SelectItem>
          </SelectContent>
        </Select>
        {bucket === "active" ? (
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} />
            Sort by due date
          </label>
        ) : null}
      </div>

      <Separator />

      <ul className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
        {tasks.map((t) => {
          const overdue = t.dueAt && bucket === "active" && new Date(t.dueAt).getTime() < nowMs
          return (
            <li key={t.id} className={cn("text-xs border border-border/50 rounded-md p-2", overdue && "border-amber-500/40 bg-amber-500/5")}>
              <div className="flex flex-wrap justify-between gap-1">
                <span className="font-medium">{t.title}</span>
                <Badge variant="outline" className="text-[9px] h-5">
                  {t.kind}
                </Badge>
              </div>
              {t.description ? <p className="text-muted-foreground mt-1">{t.description}</p> : null}
              <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-muted-foreground">
                {t.dueAt ? <span>Due {formatDateTime(t.dueAt)}</span> : <span>No due date</span>}
                {overdue ? (
                  <Badge className="text-[9px] h-5 bg-amber-500/15 text-amber-700 border-amber-500/30">Overdue</Badge>
                ) : null}
              </div>
              {bucket === "active" ? (
                <div className="flex flex-wrap gap-1 mt-2">
                  <Button type="button" size="sm" variant="secondary" className="h-7 text-[10px]" onClick={() => void patchTask(t.id, { status: "DONE" })}>
                    Done
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void patchTask(t.id, { snoozeHours: 24 })}>
                    Snooze 24h
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => void patchTask(t.id, { status: "CANCELLED", outcomeNote: "Cancelled" })}>
                    Cancel
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
        {!loading && tasks.length === 0 ? <p className="text-[11px] text-muted-foreground">No tasks in this view.</p> : null}
      </ul>
    </div>
  )
}
