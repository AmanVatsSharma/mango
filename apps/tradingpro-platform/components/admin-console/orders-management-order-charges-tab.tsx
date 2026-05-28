/**
 * @file orders-management-order-charges-tab.tsx
 * @module admin-console
 * @description Admin editor for platform order charges (non-brokerage) stored in SystemSettings.
 * @author StockTrade
 * @created 2026-03-27
 */

"use client"

import { useCallback, useEffect, useState } from "react"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import { DEFAULT_ORDER_CHARGES_CONFIG_V1 } from "@/lib/order-charges/defaults"
import type { OrderChargeLineV1, OrderChargesConfigV1 } from "@/lib/order-charges/types"
import { parseOrderChargesConfigJson } from "@/lib/order-charges/parse"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Save, RotateCcw } from "lucide-react"
import { toast } from "@/hooks/use-toast"

function cloneConfig(c: OrderChargesConfigV1): OrderChargesConfigV1 {
  return {
    ...c,
    gstBaseCodes: [...c.gstBaseCodes],
    lines: c.lines.map((l) => ({ ...l })),
  }
}

function newCustomLine(): OrderChargeLineV1 {
  return {
    id: `custom-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`,
    code: "platform_fee",
    source: "custom",
    label: "Custom charge",
    enabled: true,
    mode: "turnover_rate",
    value: 0,
    segment: null,
    product: null,
    side: null,
  }
}

export function OrdersManagementOrderChargesTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<OrderChargesConfigV1>(() =>
    cloneConfig(DEFAULT_ORDER_CHARGES_CONFIG_V1),
  )
  const [gstBaseInput, setGstBaseInput] = useState("brokerage,exchange_transaction")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/settings?key=${encodeURIComponent(ADMIN_SETTING_KEYS.ORDER_CHARGES_CONFIG_V1)}`,
      )
      if (!res.ok) throw new Error(`Load failed: ${res.status}`)
      const data = await res.json()
      const raw = data?.setting?.value
      const parsed = parseOrderChargesConfigJson(raw ?? null)
      const cfg = parsed.ok ? parsed.config : DEFAULT_ORDER_CHARGES_CONFIG_V1
      setDraft(cloneConfig(cfg))
      setGstBaseInput(cfg.gstBaseCodes.join(","))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load order charges"
      toast({ title: "Error", description: msg, variant: "destructive" })
      setDraft(cloneConfig(DEFAULT_ORDER_CHARGES_CONFIG_V1))
      setGstBaseInput(DEFAULT_ORDER_CHARGES_CONFIG_V1.gstBaseCodes.join(","))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    const codes = gstBaseInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const next: OrderChargesConfigV1 = {
      ...draft,
      gstBaseCodes: codes,
    }
    const validate = parseOrderChargesConfigJson(JSON.stringify(next))
    if (!validate.ok) {
      toast({
        title: "Validation",
        description: validate.error,
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: ADMIN_SETTING_KEYS.ORDER_CHARGES_CONFIG_V1,
          value: JSON.stringify(validate.config),
          description: "Platform order charges (non-brokerage): STT, exchange, stamp, GST base, custom lines",
          category: "TRADING",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.message || "Save failed")
      }
      toast({ title: "Saved", description: "Order charges updated." })
      setDraft(cloneConfig(validate.config))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed"
      toast({ title: "Error", description: msg, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const resetToDefaults = () => {
    setDraft(cloneConfig(DEFAULT_ORDER_CHARGES_CONFIG_V1))
    setGstBaseInput(DEFAULT_ORDER_CHARGES_CONFIG_V1.gstBaseCodes.join(","))
    toast({ title: "Reset", description: "Form reset to platform defaults (save to apply)." })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading order charges…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Reference defaults</CardTitle>
          <CardDescription>
            Read-only snapshot of factory defaults (same as JSON you get on first save). Brokerage stays under
            Settings → Brokerage (`RiskConfig`).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs font-mono bg-muted/40 rounded-md p-3 max-h-48 overflow-auto">
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(DEFAULT_ORDER_CHARGES_CONFIG_V1, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Active configuration</CardTitle>
              <CardDescription>GST applies to the sum of amounts for the listed line codes plus optional brokerage.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={resetToDefaults}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset form
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 max-w-xs">
            <Label htmlFor="gst-rate">GST rate (0–1)</Label>
            <Input
              id="gst-rate"
              type="number"
              step="0.0001"
              value={draft.gstRate}
              onChange={(e) =>
                setDraft((d) => ({ ...d, gstRate: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="grid gap-2 md:max-w-xl">
            <Label htmlFor="gst-base">GST base codes (comma-separated)</Label>
            <Input
              id="gst-base"
              value={gstBaseInput}
              onChange={(e) => setGstBaseInput(e.target.value)}
              placeholder="brokerage,exchange_transaction"
            />
            <p className="text-xs text-muted-foreground">
              Use line <code className="text-[10px]">code</code> values (e.g. <code>exchange_transaction</code>) and{" "}
              <code>brokerage</code> for the computed brokerage component.
            </p>
          </div>

          <div className="overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>On</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Side</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.lines.map((line, idx) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Switch
                        checked={line.enabled}
                        onCheckedChange={(v) =>
                          setDraft((d) => {
                            const lines = [...d.lines]
                            lines[idx] = { ...lines[idx], enabled: Boolean(v) }
                            return { ...d, lines }
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-xs capitalize">{line.source}</TableCell>
                    <TableCell>
                      <Input
                        className="min-w-[100px] text-xs h-8"
                        value={line.code}
                        disabled={line.source === "builtin"}
                        onChange={(e) =>
                          setDraft((d) => {
                            const lines = [...d.lines]
                            lines[idx] = { ...lines[idx], code: e.target.value.trim() || "custom" }
                            return { ...d, lines }
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="min-w-[140px] text-xs h-8"
                        value={line.label ?? ""}
                        placeholder={line.source === "custom" ? "Required name" : ""}
                        onChange={(e) =>
                          setDraft((d) => {
                            const lines = [...d.lines]
                            lines[idx] = { ...lines[idx], label: e.target.value || undefined }
                            return { ...d, lines }
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={line.mode}
                        onValueChange={(v) =>
                          setDraft((d) => {
                            const lines = [...d.lines]
                            lines[idx] = { ...lines[idx], mode: v as OrderChargeLineV1["mode"] }
                            return { ...d, lines }
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="turnover_rate">turnover_rate</SelectItem>
                          <SelectItem value="flat_per_order">flat_per_order</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-24 h-8 text-xs"
                        step="0.0000001"
                        value={line.value}
                        onChange={(e) =>
                          setDraft((d) => {
                            const lines = [...d.lines]
                            lines[idx] = { ...lines[idx], value: Number(e.target.value) || 0 }
                            return { ...d, lines }
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="min-w-[90px] text-xs h-8"
                        value={line.segment ?? ""}
                        placeholder="all"
                        onChange={(e) =>
                          setDraft((d) => {
                            const lines = [...d.lines]
                            const v = e.target.value.trim()
                            lines[idx] = { ...lines[idx], segment: v ? v : null }
                            return { ...d, lines }
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="min-w-[90px] text-xs h-8"
                        value={line.product ?? ""}
                        placeholder="all"
                        onChange={(e) =>
                          setDraft((d) => {
                            const lines = [...d.lines]
                            const v = e.target.value.trim()
                            lines[idx] = { ...lines[idx], product: v ? v : null }
                            return { ...d, lines }
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={line.side ?? "any"}
                        onValueChange={(v) =>
                          setDraft((d) => {
                            const lines = [...d.lines]
                            lines[idx] = {
                              ...lines[idx],
                              side: v === "any" ? null : (v as "BUY" | "SELL"),
                            }
                            return { ...d, lines }
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs w-[88px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          <SelectItem value="BUY">BUY</SelectItem>
                          <SelectItem value="SELL">SELL</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                lines: [...d.lines, newCustomLine()],
              }))
            }
          >
            Add custom charge
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
