"use client"

/**
 * File:        components/admin-console/trades-blotter/trade-actions.tsx
 * Module:      admin-console/trades-blotter
 * Purpose:     Inline action buttons (force-close, edit note, cancel pending, copy ID) shown
 *              inside the expanded trade row accordion — no dropdown, buttons render directly.
 *
 * Exports:
 *   - TradeActionInline(props) — renders action button strip + dialog trio for a single trade
 *
 * Depends on:
 *   - @/components/ui/* — Dialog, Button, Input, Select, Label
 *   - @/app/api/admin/trades/types — TradeRow, ClosureReason
 *
 * Side-effects:
 *   - HTTP POST /api/admin/trades/[positionId]/close
 *   - HTTP POST /api/admin/trades/[positionId]/note
 *   - HTTP POST /api/admin/trades/orders/[orderId]/cancel
 *
 * Key invariants:
 *   - onPauseAutoRefresh is called with true while any dialog is open to suppress table polling
 *   - Dialogs are rendered in-place (no portal); they work whether the row is expanded or not
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-20
 */

import React, { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Ban, Copy, FileText, XCircle } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import type { TradeRow, ClosureReason } from "@/app/api/admin/trades/types"

const CLOSURE_REASONS: { value: ClosureReason; label: string }[] = [
  { value: "ADMIN_CLOSED", label: "Admin closed" },
  { value: "AUTO_LIQUIDATED", label: "Auto liquidated (risk)" },
  { value: "EXPIRY_SQUAREOFF", label: "Expiry square-off" },
  { value: "MANUAL_OTHER", label: "Manual (other)" },
]

export function TradeActionInline({
  trade,
  onChanged,
  onPauseAutoRefresh,
}: {
  trade: TradeRow
  onChanged: () => void
  onPauseAutoRefresh?: (paused: boolean) => void
}) {
  const [closeOpen, setCloseOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const anyOpen = closeOpen || noteOpen || cancelOpen
  React.useEffect(() => {
    onPauseAutoRefresh?.(anyOpen)
  }, [anyOpen, onPauseAutoRefresh])

  const maxCloseQty = Math.abs(trade.openQuantity)
  const isOpen = trade.status !== "CLOSED" && maxCloseQty > 0
  const pendingOrders = useMemo(
    () => [...trade.openOrders, ...trade.closeOrders].filter((o) => o.status === "PENDING"),
    [trade],
  )

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          disabled={!isOpen}
          className="h-7 px-2.5 text-xs border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:border-rose-500/60 disabled:opacity-40"
          onClick={() => setCloseOpen(true)}
        >
          <Ban className="w-3 h-3 mr-1.5" />
          Force close
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs"
          onClick={() => setNoteOpen(true)}
        >
          <FileText className="w-3 h-3 mr-1.5" />
          Edit note
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pendingOrders.length === 0}
          className="h-7 px-2.5 text-xs disabled:opacity-40"
          onClick={() => setCancelOpen(true)}
        >
          <XCircle className="w-3 h-3 mr-1.5" />
          Cancel pending{pendingOrders.length > 0 ? ` (${pendingOrders.length})` : ""}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            void navigator.clipboard.writeText(trade.positionId)
            toast({ title: "Copied", description: "Position ID copied." })
          }}
        >
          <Copy className="w-3 h-3 mr-1.5" />
          Copy ID
        </Button>
      </div>

      <ForceCloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        trade={trade}
        maxCloseQty={maxCloseQty}
        onChanged={onChanged}
      />
      <EditNoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        trade={trade}
        onChanged={onChanged}
      />
      <CancelPendingDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        trade={trade}
        pendingOrders={pendingOrders}
        onChanged={onChanged}
      />
    </>
  )
}

// ─── Force-close dialog ──────────────────────────────────────────────────────

function ForceCloseDialog({
  open,
  onOpenChange,
  trade,
  maxCloseQty,
  onChanged,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  trade: TradeRow
  maxCloseQty: number
  onChanged: () => void
}) {
  const [quantity, setQuantity] = useState<string>("")
  const [exitPrice, setExitPrice] = useState<string>("")
  const [reason, setReason] = useState<ClosureReason>("ADMIN_CLOSED")
  const [note, setNote] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)

  React.useEffect(() => {
    if (open) {
      setQuantity(String(maxCloseQty))
      setExitPrice(trade.ltp != null ? String(trade.ltp) : "")
      setReason("ADMIN_CLOSED")
      setNote("")
    }
  }, [open, maxCloseQty, trade.ltp])

  const submit = async () => {
    const qtyNum = Number(quantity)
    const priceNum = Number(exitPrice)
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast({ title: "Invalid exit price", description: "Enter a positive price.", variant: "destructive" })
      return
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0 || qtyNum > maxCloseQty) {
      toast({ title: "Invalid quantity", description: `Enter 1..${maxCloseQty}`, variant: "destructive" })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/trades/${trade.positionId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: qtyNum, exitPrice: priceNum, reason, note: note.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message || data?.error || `Close failed: ${res.status}`)
      toast({ title: "Position closed", description: `${trade.symbol} force-closed.` })
      onOpenChange(false)
      onChanged()
    } catch (e: unknown) {
      toast({ title: "Close failed", description: e instanceof Error ? e.message : "Close failed", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Force close — {trade.symbol}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {trade.userName ?? trade.clientId ?? "—"} · Open qty{" "}
            <span className="font-semibold text-foreground">{maxCloseQty}</span>
            {trade.ltp != null && (
              <span className="ml-2 text-xs text-sky-600">LTP ₹{trade.ltp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="close-qty">Quantity</Label>
              <Input id="close-qty" type="number" min={1} max={maxCloseQty} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="close-price">Exit price (₹)</Label>
              <Input id="close-price" type="number" min={0} step="0.05" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="close-reason">Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as ClosureReason)}>
              <SelectTrigger id="close-reason"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLOSURE_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="close-note">Note (optional, 500 chars)</Label>
            <Input id="close-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Visible in audit + trade meta" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={submit} disabled={submitting}>
            {submitting ? "Closing…" : "Force close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit note dialog ────────────────────────────────────────────────────────

function EditNoteDialog({
  open,
  onOpenChange,
  trade,
  onChanged,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  trade: TradeRow
  onChanged: () => void
}) {
  const [note, setNote] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)

  React.useEffect(() => {
    if (open) setNote(trade.closureNote ?? "")
  }, [open, trade.closureNote])

  const submit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/trades/${trade.positionId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message || data?.error || `Note save failed: ${res.status}`)
      toast({ title: "Note saved" })
      onOpenChange(false)
      onChanged()
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Note save failed", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Admin note — {trade.symbol}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="trade-note">Note (max 500 chars)</Label>
          <Input id="trade-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Anything the admin team should know" />
          <p className="text-[11px] text-muted-foreground">On open positions this is an admin note; on close it becomes the closure note.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Saving…" : "Save note"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Cancel pending orders dialog ────────────────────────────────────────────

function CancelPendingDialog({
  open,
  onOpenChange,
  trade,
  pendingOrders,
  onChanged,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  trade: TradeRow
  pendingOrders: TradeRow["openOrders"]
  onChanged: () => void
}) {
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (pendingOrders.length === 0) return
    setSubmitting(true)
    let ok = 0
    for (const o of pendingOrders) {
      try {
        const res = await fetch(`/api/admin/trades/orders/${o.id}/cancel`, { method: "POST" })
        if (res.ok) ok++
      } catch {}
    }
    setSubmitting(false)
    toast({ title: `Cancelled ${ok} / ${pendingOrders.length} order(s)`, description: trade.symbol })
    onOpenChange(false)
    onChanged()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel pending orders — {trade.symbol}</DialogTitle>
        </DialogHeader>
        <div className="text-sm space-y-2">
          <p className="text-muted-foreground">
            {pendingOrders.length} pending order(s) will be cancelled. Blocked margin + placement charges will be refunded.
          </p>
          <ul className="list-disc ml-5 text-xs space-y-0.5">
            {pendingOrders.map((o) => (
              <li key={o.id}>
                {o.orderPurpose === "OPEN" ? "ENTRY" : "EXIT"} · {o.orderSide} · {o.quantity} @{" "}
                {o.price != null ? `₹${o.price}` : "MKT"}
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Keep</Button>
          <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={submit} disabled={submitting}>
            {submitting ? "Cancelling…" : "Cancel pending"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
