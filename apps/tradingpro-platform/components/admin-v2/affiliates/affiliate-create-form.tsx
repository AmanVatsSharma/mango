/**
 * @file components/admin-v2/affiliates/affiliate-create-form.tsx
 * @module admin-v2/affiliates
 * @description Modal form to onboard a new affiliate. Lightweight inputs — admin can edit
 *              everything later via the detail drawer (commission rules, payoutMethod, etc.).
 *              Auto-generates affiliateCode if blank.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Status, Tier } from "./types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

export function AffiliateCreateForm({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [tier, setTier] = React.useState<Tier>("BRONZE")
  const [status, setStatus] = React.useState<Status>("PENDING")
  const [parentAffiliateCode, setParentAffiliateCode] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setName(""); setEmail(""); setPhone(""); setTier("BRONZE"); setStatus("PENDING")
      setParentAffiliateCode(""); setPassword(""); setError(null); setBusy(false)
    }
  }, [open])

  if (!open) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      // Resolve parent code → id (lightweight client-side lookup via list endpoint).
      let parentId: string | null = null
      if (parentAffiliateCode.trim()) {
        const res = await fetch(
          `/api/admin/affiliates?q=${encodeURIComponent(parentAffiliateCode.trim())}&limit=5`,
          { credentials: "same-origin" },
        )
        const body = (await res.json().catch(() => null)) as { rows?: Array<{ id: string; affiliateCode: string }> } | null
        const exact = body?.rows?.find((r) => r.affiliateCode.toUpperCase() === parentAffiliateCode.trim().toUpperCase())
        if (!exact) {
          throw new Error("Parent affiliate code not found")
        }
        parentId = exact.id
      }

      const res = await fetch("/api/admin/affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          tier,
          status,
          parentAffiliateId: parentId,
          password: password.trim() || null,
        }),
      })
      const body = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null
      if (!res.ok || !body?.success) {
        throw new Error(body?.message ?? `Failed (${res.status})`)
      }
      onCreated?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="v2-card w-full max-w-md p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--v2-text)]">New affiliate</h3>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-[var(--v2-text-mute)] hover:bg-white/[0.04] hover:text-[var(--v2-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Name *">
            <input value={name} onChange={(e) => setName(e.target.value)} required className={INPUT} />
          </Field>
          <Field label="Email *">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={INPUT} />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tier">
              <select value={tier} onChange={(e) => setTier(e.target.value as Tier)} className={INPUT}>
                <option value="BRONZE">Bronze</option>
                <option value="SILVER">Silver</option>
                <option value="GOLD">Gold</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={INPUT}>
                <option value="PENDING">Pending</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </Field>
          </div>
          <Field label="Parent affiliate code (optional)">
            <input
              value={parentAffiliateCode}
              onChange={(e) => setParentAffiliateCode(e.target.value)}
              placeholder="AFF-XXXXXXXX"
              className={cn(INPUT, "font-mono")}
            />
          </Field>
          <Field label="Initial password (optional)">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Affiliate can reset later via self-service"
              className={INPUT}
            />
          </Field>
        </div>

        {error && <p className="mt-3 text-xs font-medium text-[var(--v2-loss)]">{error}</p>}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-[var(--v2-text-mute)] hover:text-[var(--v2-text)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim() || !email.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-3 py-1.5 text-xs font-semibold text-[#9DB6FF] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Create affiliate
          </button>
        </div>
      </form>
    </div>
  )
}

const INPUT = "w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus:border-[var(--v2-border-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--v2-border-accent)]"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
        {label}
      </span>
      {children}
    </label>
  )
}
