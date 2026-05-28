"use client"

/**
 * @file payment-deposit-settings-panel.tsx
 * @module components/admin-console
 * @description Admin editor for `payment_deposit_config_v1`: methods, limits, copy, QR uploads, and display order.
 * @author StockTrade
 * @created 2026-03-25
 * @updated 2026-03-25 — QR / image uploads: shared thumb + optional blob preview while uploading; crypto wallet preview parity with UPI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import {
  DEFAULT_PUBLIC_METHOD_ORDER,
  PAYMENT_DEPOSIT_CONFIG_V1_KEY,
} from "@/lib/payment-deposit-public"
import type {
  BankDomesticAccount,
  BankIntlAccount,
  CryptoWalletConfig,
  PaymentDepositConfigV1,
  UpiDepositItem,
} from "@/lib/payment-deposit-config.shared"
import {
  Banknote,
  Building2,
  ChevronDown,
  ChevronUp,
  Coins,
  LayoutGrid,
  LifeBuoy,
  Link2,
  Loader2,
  Plus,
  QrCode,
  Save,
  Trash2,
  Upload,
} from "lucide-react"

const METHOD_LABELS: Record<string, string> = {
  upi: "UPI",
  bank: "Domestic bank",
  cash: "Cash / branch",
  crypto: "Crypto (USDT / USDC)",
  wire_intl: "International wire",
  cheque: "Cheque / DD",
  external_pay: "External payment link",
  contact_support: "Contact / support",
}

function newItemId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}`
}

/** Clickable thumbnail for UPI / wallet QR or any uploaded payment image (remote URL or temporary blob). */
function DepositImageThumb({
  imageUrl,
  onPickClick,
  alt = "Uploaded image preview",
  emptyLabel = "No image",
  ariaLabel = "Select or replace image",
}: {
  imageUrl: string | undefined
  onPickClick?: () => void
  alt?: string
  emptyLabel?: string
  ariaLabel?: string
}) {
  const [broken, setBroken] = useState(false)
  const showImage = Boolean(imageUrl && !broken)

  useEffect(() => {
    setBroken(false)
  }, [imageUrl])

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onPickClick?.()}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={alt}
          className="max-h-full max-w-full object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-1 p-2 text-center">
          <QrCode className="h-8 w-8 opacity-60" />
          <span className="text-[10px] leading-tight text-muted-foreground">{emptyLabel}</span>
        </div>
      )}
    </button>
  )
}

async function uploadAdminPublicImage(file: File): Promise<string> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("folder", "payment-qr-codes")
  formData.append("isPublic", "true")
  const response = await fetch("/api/admin/upload", { method: "POST", body: formData })
  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Upload failed")
  }
  return data.url as string
}

export interface PaymentDepositSettingsPanelProps {
  value: PaymentDepositConfigV1
  onChange: (next: PaymentDepositConfigV1) => void
  saving: boolean
  onSave: () => Promise<void>
}

export function PaymentDepositSettingsPanel({ value, onChange, saving, onSave }: PaymentDepositSettingsPanelProps) {
  const order = value.order?.length ? value.order : [...DEFAULT_PUBLIC_METHOD_ORDER]

  /** Tracks blob: URLs for revoke on unmount / replace. */
  const blobTrackRef = useRef<Set<string>>(new Set())
  const [blobPreviewById, setBlobPreviewById] = useState<Record<string, string>>({})

  const revokeBlobUrl = useCallback((url: string | undefined) => {
    if (url?.startsWith("blob:")) {
      URL.revokeObjectURL(url)
      blobTrackRef.current.delete(url)
    }
  }, [])

  const setBlobPreviewForId = useCallback(
    (id: string, file: File | null) => {
      setBlobPreviewById((prev) => {
        const next = { ...prev }
        const old = next[id]
        if (old) revokeBlobUrl(old)
        if (file) {
          const blob = URL.createObjectURL(file)
          blobTrackRef.current.add(blob)
          next[id] = blob
        } else {
          delete next[id]
        }
        return next
      })
    },
    [revokeBlobUrl]
  )

  const clearBlobPreviewForId = useCallback(
    (id: string) => {
      setBlobPreviewById((prev) => {
        const next = { ...prev }
        const old = next[id]
        if (old) revokeBlobUrl(old)
        delete next[id]
        return next
      })
    },
    [revokeBlobUrl]
  )

  useEffect(() => {
    return () => {
      for (const u of blobTrackRef.current) {
        URL.revokeObjectURL(u)
      }
      blobTrackRef.current.clear()
    }
  }, [])

  const moveMethod = useCallback(
    (id: string, dir: -1 | 1) => {
      const idx = order.indexOf(id)
      if (idx < 0) return
      const j = idx + dir
      if (j < 0 || j >= order.length) return
      const nextOrder = [...order]
      ;[nextOrder[idx], nextOrder[j]] = [nextOrder[j], nextOrder[idx]]
      onChange({ ...value, order: nextOrder })
    },
    [onChange, order, value]
  )

  const setGlobal = (patch: Partial<NonNullable<PaymentDepositConfigV1["global"]>>) => {
    onChange({
      ...value,
      global: { ...value.global, ...patch },
    })
  }

  const uploadQrForUpi = async (itemIndex: number, file: File | null) => {
    if (!file) return
    const rowId = value.methods.upi.items[itemIndex]?.id
    if (!rowId) return
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" })
      return
    }
    setBlobPreviewForId(rowId, file)
    try {
      const url = await uploadAdminPublicImage(file)
      const items = [...value.methods.upi.items]
      const cur = items[itemIndex]
      if (!cur) return
      items[itemIndex] = { ...cur, qrCodeUrl: url }
      onChange({
        ...value,
        methods: { ...value.methods, upi: { ...value.methods.upi, items } },
      })
      toast({ title: "Uploaded", description: "QR image saved to this UPI entry" })
    } catch (e: unknown) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      })
    } finally {
      clearBlobPreviewForId(rowId)
    }
  }

  const uploadQrForWallet = async (walletIndex: number, file: File | null) => {
    if (!file) return
    const rowId = value.methods.crypto.wallets[walletIndex]?.id
    if (!rowId) return
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" })
      return
    }
    setBlobPreviewForId(rowId, file)
    try {
      const url = await uploadAdminPublicImage(file)
      const wallets = [...value.methods.crypto.wallets]
      const cur = wallets[walletIndex]
      if (!cur) return
      wallets[walletIndex] = { ...cur, qrCodeUrl: url }
      onChange({
        ...value,
        methods: { ...value.methods, crypto: { ...value.methods.crypto, wallets } },
      })
      toast({ title: "Uploaded", description: "QR attached to wallet" })
    } catch (e: unknown) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      })
    } finally {
      clearBlobPreviewForId(rowId)
    }
  }

  const enabledSummary = useMemo(() => {
    const m = value.methods
    const pairs: [string, boolean][] = [
      ["UPI", m.upi.enabled],
      ["Bank", m.bankDomestic.enabled],
      ["Cash", m.cash.enabled],
      ["Crypto", m.crypto.enabled],
      ["Wire", m.bankIntlWire.enabled],
      ["Cheque", m.cheque.enabled],
      ["Link", m.externalGateway.enabled],
      ["Support", m.contactSupport.enabled],
    ]
    return pairs.filter(([, on]) => on).map(([label]) => label)
  }, [value.methods])

  return (
    <Card className="border-border bg-card shadow-sm neon-border overflow-hidden">
      <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
              Deposit methods
            </CardTitle>
            <CardDescription className="text-xs leading-snug sm:text-sm">
              Configure funding options for the user console. Key{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground sm:text-xs">
                {PAYMENT_DEPOSIT_CONFIG_V1_KEY}
              </code>
            </CardDescription>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-1.5">
            {enabledSummary.length ? (
              enabledSummary.map((label) => (
                <Badge
                  key={label}
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-normal uppercase tracking-wide"
                >
                  {label}
                </Badge>
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground">No methods enabled</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-0 px-0 pb-0 pt-0">
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-background/90 px-4 py-2.5 backdrop-blur-sm sm:px-5">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Changes apply after you save.</p>
          <Button
            type="button"
            size="sm"
            onClick={() => void onSave()}
            disabled={saving}
            className="h-8 shrink-0 gap-1.5 px-3 text-xs"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                Save configuration
              </>
            )}
          </Button>
        </div>

        <Tabs defaultValue="overview" className="w-full gap-0">
          <div className="border-b border-border/60 bg-muted/10 px-2 pt-3 sm:px-4">
            <TabsList className="mb-0 h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 sm:inline-flex sm:h-9 sm:flex-nowrap sm:rounded-md sm:bg-muted sm:p-1">
              <TabsTrigger
                value="overview"
                className="gap-1 rounded-md px-2.5 py-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3"
              >
                <LayoutGrid className="h-3.5 w-3.5 opacity-70" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="upi"
                className="gap-1 rounded-md px-2.5 py-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3"
              >
                <QrCode className="h-3.5 w-3.5 opacity-70" />
                UPI
              </TabsTrigger>
              <TabsTrigger
                value="banks"
                className="gap-1 rounded-md px-2.5 py-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3"
              >
                <Building2 className="h-3.5 w-3.5 opacity-70" />
                Banks
              </TabsTrigger>
              <TabsTrigger
                value="digital"
                className="gap-1 rounded-md px-2.5 py-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3"
              >
                <Coins className="h-3.5 w-3.5 opacity-70" />
                Cash &amp; crypto
              </TabsTrigger>
              <TabsTrigger
                value="more"
                className="gap-1 rounded-md px-2.5 py-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3"
              >
                <LifeBuoy className="h-3.5 w-3.5 opacity-70" />
                More
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="m-0 space-y-4 px-4 py-4 sm:px-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 rounded-lg border border-border/80 bg-muted/15 p-3">
                <Label className="text-xs font-medium text-muted-foreground">Global min (INR)</Label>
                <Input
                  type="number"
                  value={value.global?.minAmount ?? ""}
                  onChange={(e) =>
                    setGlobal({ minAmount: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  className="h-9 bg-background/80 text-sm"
                />
              </div>
              <div className="space-y-1.5 rounded-lg border border-border/80 bg-muted/15 p-3">
                <Label className="text-xs font-medium text-muted-foreground">Global max (INR)</Label>
                <Input
                  type="number"
                  value={value.global?.maxAmount ?? ""}
                  onChange={(e) =>
                    setGlobal({ maxAmount: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  className="h-9 bg-background/80 text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Display order
                </Label>
                <span className="text-[10px] text-muted-foreground">Deposit form · reorder with arrows</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-border/80">
                {order.map((id) => (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-2 border-b border-border/50 px-2.5 py-1.5 last:border-b-0"
                  >
                    <span className="text-xs font-medium">{METHOD_LABELS[id] ?? id}</span>
                    <div className="flex gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => moveMethod(id, -1)}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => moveMethod(id, 1)}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="upi" className="m-0 space-y-0 px-4 py-4 sm:px-5">
        <section className="space-y-2 rounded-xl border border-border/80 bg-muted/10 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 gap-y-1">
              <Switch
                checked={value.methods.upi.enabled}
                onCheckedChange={(enabled) =>
                  onChange({
                    ...value,
                    methods: { ...value.methods, upi: { ...value.methods.upi, enabled } },
                  })
                }
              />
              <div className="min-w-0">
                <span className="block text-sm font-medium">UPI</span>
                <span className="text-xs text-muted-foreground">QR thumbnails, labels, and UPI IDs</span>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                const item: UpiDepositItem = {
                  id: newItemId("upi"),
                  label: `UPI ${value.methods.upi.items.length + 1}`,
                  upiId: "",
                }
                onChange({
                  ...value,
                  methods: {
                    ...value.methods,
                    upi: { ...value.methods.upi, items: [...value.methods.upi.items, item] },
                  },
                })
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add UPI
            </Button>
          </div>

          <Collapsible className="rounded-xl border border-border bg-muted/30">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-muted/50">
              <span>Display & limits</span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 border-t border-border px-3 pb-3 pt-2">
              {(["clientTitle", "clientDescription", "badgeText"] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs capitalize">{k.replace(/([A-Z])/g, " $1")}</Label>
                  {k === "clientDescription" ? (
                    <Textarea
                      value={(value.methods.upi as Record<string, string | undefined>)[k] ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          methods: {
                            ...value.methods,
                            upi: { ...value.methods.upi, [k]: e.target.value || undefined },
                          },
                        })
                      }
                      className="min-h-[72px] bg-background/80 text-sm"
                    />
                  ) : (
                    <Input
                      value={(value.methods.upi as Record<string, string | undefined>)[k] ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          methods: {
                            ...value.methods,
                            upi: { ...value.methods.upi, [k]: e.target.value || undefined },
                          },
                        })
                      }
                      className="bg-background/80 text-sm"
                    />
                  )}
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Min INR</Label>
                  <Input
                    type="number"
                    className="bg-background/80 text-sm"
                    value={value.methods.upi.minAmount ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        methods: {
                          ...value.methods,
                          upi: {
                            ...value.methods.upi,
                            minAmount: e.target.value === "" ? undefined : Number(e.target.value),
                          },
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max INR</Label>
                  <Input
                    type="number"
                    className="bg-background/80 text-sm"
                    value={value.methods.upi.maxAmount ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        methods: {
                          ...value.methods,
                          upi: {
                            ...value.methods.upi,
                            maxAmount: e.target.value === "" ? undefined : Number(e.target.value),
                          },
                        },
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  id="upi-recommended"
                  checked={value.methods.upi.recommended ?? false}
                  onCheckedChange={(recommended) =>
                    onChange({
                      ...value,
                      methods: { ...value.methods, upi: { ...value.methods.upi, recommended } },
                    })
                  }
                />
                <Label htmlFor="upi-recommended" className="text-xs font-normal">
                  Recommended badge
                </Label>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex flex-col gap-2">
            {value.methods.upi.items.map((item, idx) => {
              const inputId = `upi-qr-${item.id}`
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:flex-row sm:items-stretch sm:gap-3"
                >
                  <div className="flex shrink-0 items-start gap-2">
                    <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                      {idx + 1}
                    </span>
                    <DepositImageThumb
                      imageUrl={blobPreviewById[item.id] ?? item.qrCodeUrl}
                      onPickClick={() => document.getElementById(inputId)?.click()}
                      alt={`UPI QR ${idx + 1}`}
                      emptyLabel="No QR"
                      ariaLabel="Select UPI QR image"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Input
                      placeholder="Label (e.g. Primary)"
                      className="h-9 bg-background/80 text-sm"
                      value={item.label ?? ""}
                      onChange={(e) => {
                        const items = [...value.methods.upi.items]
                        items[idx] = { ...items[idx], label: e.target.value }
                        onChange({
                          ...value,
                          methods: { ...value.methods, upi: { ...value.methods.upi, items } },
                        })
                      }}
                    />
                    <Input
                      placeholder="UPI ID"
                      className="h-9 bg-background/80 text-sm"
                      value={item.upiId}
                      onChange={(e) => {
                        const items = [...value.methods.upi.items]
                        items[idx] = { ...items[idx], upiId: e.target.value }
                        onChange({
                          ...value,
                          methods: { ...value.methods, upi: { ...value.methods.upi, items } },
                        })
                      }}
                    />
                  </div>
                  <div className="flex flex-row flex-wrap items-center gap-2 sm:flex-col sm:items-stretch sm:justify-center">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id={inputId}
                      onChange={(ev) => {
                        const f = ev.target.files?.[0]
                        void uploadQrForUpi(idx, f ?? null)
                        ev.target.value = ""
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() => document.getElementById(inputId)?.click()}
                    >
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      {item.qrCodeUrl || blobPreviewById[item.id] ? "Replace" : "Upload"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 text-xs text-destructive hover:text-destructive"
                      onClick={() => {
                        clearBlobPreviewForId(item.id)
                        const items = value.methods.upi.items.filter((_, i) => i !== idx)
                        onChange({
                          ...value,
                          methods: { ...value.methods, upi: { ...value.methods.upi, items } },
                        })
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
          </TabsContent>

          <TabsContent value="banks" className="m-0 space-y-4 px-4 py-4 sm:px-5">
        {/* Domestic bank */}
        <section className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={value.methods.bankDomestic.enabled}
                onCheckedChange={(enabled) =>
                  onChange({
                    ...value,
                    methods: { ...value.methods, bankDomestic: { ...value.methods.bankDomestic, enabled } },
                  })
                }
              />
              <span className="font-medium">Domestic bank transfer</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const row: BankDomesticAccount = {
                  id: newItemId("bank"),
                  bankName: "",
                  accountHolder: "",
                  accountNumber: "",
                  ifsc: "",
                }
                onChange({
                  ...value,
                  methods: {
                    ...value.methods,
                    bankDomestic: {
                      ...value.methods.bankDomestic,
                      accounts: [...value.methods.bankDomestic.accounts, row],
                    },
                  },
                })
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add account
            </Button>
          </div>
          {value.methods.bankDomestic.accounts.map((row, idx) => (
            <div key={row.id} className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border border-dashed p-3">
              <div className="sm:col-span-2 flex justify-end">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const accounts = value.methods.bankDomestic.accounts.filter((_, i) => i !== idx)
                    onChange({
                      ...value,
                      methods: {
                        ...value.methods,
                        bankDomestic: { ...value.methods.bankDomestic, accounts },
                      },
                    })
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              {(
                [
                  ["bankName", "Bank name"],
                  ["accountHolder", "Account holder"],
                  ["accountNumber", "Account number"],
                  ["ifsc", "IFSC"],
                  ["branch", "Branch"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Input
                    value={(row as any)[key] ?? ""}
                    onChange={(e) => {
                      const accounts = [...value.methods.bankDomestic.accounts]
                      accounts[idx] = { ...accounts[idx], [key]: e.target.value }
                      onChange({
                        ...value,
                        methods: {
                          ...value.methods,
                          bankDomestic: { ...value.methods.bankDomestic, accounts },
                        },
                      })
                    }}
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <Label>Instructions</Label>
                <Textarea
                  value={row.instructions ?? ""}
                  onChange={(e) => {
                    const accounts = [...value.methods.bankDomestic.accounts]
                    accounts[idx] = { ...accounts[idx], instructions: e.target.value }
                    onChange({
                      ...value,
                      methods: {
                        ...value.methods,
                        bankDomestic: { ...value.methods.bankDomestic, accounts },
                      },
                    })
                  }}
                />
              </div>
            </div>
          ))}
        </section>

        <Separator className="my-1 bg-border/60" />

        <section className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={value.methods.bankIntlWire.enabled}
                onCheckedChange={(enabled) =>
                  onChange({
                    ...value,
                    methods: {
                      ...value.methods,
                      bankIntlWire: { ...value.methods.bankIntlWire, enabled },
                    },
                  })
                }
              />
              <span className="text-sm font-medium">International wire</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => {
                const row: BankIntlAccount = {
                  id: newItemId("wire"),
                  beneficiary: "",
                  bankName: "",
                  ibanOrAccount: "",
                  swift: "",
                }
                onChange({
                  ...value,
                  methods: {
                    ...value.methods,
                    bankIntlWire: {
                      ...value.methods.bankIntlWire,
                      accounts: [...value.methods.bankIntlWire.accounts, row],
                    },
                  },
                })
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add beneficiary
            </Button>
          </div>
          {value.methods.bankIntlWire.accounts.map((row, idx) => (
            <div key={row.id} className="grid grid-cols-1 gap-2 rounded-md border border-dashed border-border/80 p-3 sm:grid-cols-2">
              <div className="flex justify-end sm:col-span-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    const accounts = value.methods.bankIntlWire.accounts.filter((_, i) => i !== idx)
                    onChange({
                      ...value,
                      methods: {
                        ...value.methods,
                        bankIntlWire: { ...value.methods.bankIntlWire, accounts },
                      },
                    })
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {(
                [
                  ["beneficiary", "Beneficiary"],
                  ["bankName", "Bank"],
                  ["ibanOrAccount", "IBAN / Account"],
                  ["swift", "SWIFT"],
                  ["currency", "Currency"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    className="h-9 text-sm"
                    value={(row as any)[key] ?? ""}
                    onChange={(e) => {
                      const accounts = [...value.methods.bankIntlWire.accounts]
                      accounts[idx] = { ...accounts[idx], [key]: e.target.value }
                      onChange({
                        ...value,
                        methods: {
                          ...value.methods,
                          bankIntlWire: { ...value.methods.bankIntlWire, accounts },
                        },
                      })
                    }}
                  />
                </div>
              ))}
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Instructions</Label>
                <Textarea
                  className="min-h-[64px] text-sm"
                  value={row.instructions ?? ""}
                  onChange={(e) => {
                    const accounts = [...value.methods.bankIntlWire.accounts]
                    accounts[idx] = { ...accounts[idx], instructions: e.target.value }
                    onChange({
                      ...value,
                      methods: {
                        ...value.methods,
                        bankIntlWire: { ...value.methods.bankIntlWire, accounts },
                      },
                    })
                  }}
                />
              </div>
            </div>
          ))}
        </section>
          </TabsContent>

          <TabsContent value="digital" className="m-0 space-y-4 px-4 py-4 sm:px-5">
        {/* Cash */}
        <section className="space-y-2 rounded-lg border border-border/80 bg-muted/10 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={value.methods.cash.enabled}
              onCheckedChange={(enabled) =>
                onChange({
                  ...value,
                  methods: { ...value.methods, cash: { ...value.methods.cash, enabled } },
                })
              }
            />
            <span className="font-medium">Cash / branch instructions</span>
          </div>
          <Textarea
            placeholder="Instructions for users"
            value={value.methods.cash.instructions ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                methods: {
                  ...value.methods,
                  cash: { ...value.methods.cash, instructions: e.target.value },
                },
              })
            }
          />
        </section>

        {/* Crypto */}
        <section className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={value.methods.crypto.enabled}
                onCheckedChange={(enabled) =>
                  onChange({
                    ...value,
                    methods: { ...value.methods, crypto: { ...value.methods.crypto, enabled } },
                  })
                }
              />
              <span className="font-medium">Crypto</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const w: CryptoWalletConfig = {
                  id: newItemId("w"),
                  asset: "USDT",
                  network: "TRC20",
                  address: "",
                }
                onChange({
                  ...value,
                  methods: {
                    ...value.methods,
                    crypto: { ...value.methods.crypto, wallets: [...value.methods.crypto.wallets, w] },
                  },
                })
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add wallet
            </Button>
          </div>
          {value.methods.crypto.wallets.map((w, idx) => {
            const walletInputId = `wallet-qr-${w.id}`
            const thumbUrl = blobPreviewById[w.id] ?? w.qrCodeUrl
            return (
              <div
                key={w.id}
                className="flex flex-col gap-2 rounded-xl border border-dashed border-border/80 bg-muted/15 p-3 sm:flex-row sm:items-stretch sm:gap-3"
              >
                <div className="flex shrink-0 items-start gap-2">
                  <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                    {idx + 1}
                  </span>
                  <DepositImageThumb
                    imageUrl={thumbUrl}
                    onPickClick={() => document.getElementById(walletInputId)?.click()}
                    alt={`${w.asset} ${w.network} QR preview`}
                    emptyLabel="No QR"
                    ariaLabel="Select wallet QR image"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Asset</Label>
                      <Input
                        className="h-9 text-sm"
                        value={w.asset}
                        onChange={(e) => {
                          const wallets = [...value.methods.crypto.wallets]
                          wallets[idx] = { ...wallets[idx], asset: e.target.value }
                          onChange({
                            ...value,
                            methods: { ...value.methods, crypto: { ...value.methods.crypto, wallets } },
                          })
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Network</Label>
                      <Input
                        className="h-9 text-sm"
                        value={w.network}
                        onChange={(e) => {
                          const wallets = [...value.methods.crypto.wallets]
                          wallets[idx] = { ...wallets[idx], network: e.target.value }
                          onChange({
                            ...value,
                            methods: { ...value.methods, crypto: { ...value.methods.crypto, wallets } },
                          })
                        }}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">Address</Label>
                      <Input
                        className="h-9 text-sm"
                        value={w.address}
                        onChange={(e) => {
                          const wallets = [...value.methods.crypto.wallets]
                          wallets[idx] = { ...wallets[idx], address: e.target.value }
                          onChange({
                            ...value,
                            methods: { ...value.methods, crypto: { ...value.methods.crypto, wallets } },
                          })
                        }}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">Memo / tag</Label>
                      <Input
                        className="h-9 text-sm"
                        value={w.memoOrTag ?? ""}
                        onChange={(e) => {
                          const wallets = [...value.methods.crypto.wallets]
                          wallets[idx] = { ...wallets[idx], memoOrTag: e.target.value }
                          onChange({
                            ...value,
                            methods: { ...value.methods, crypto: { ...value.methods.crypto, wallets } },
                          })
                        }}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">Instructions</Label>
                      <Textarea
                        className="min-h-[72px] text-sm"
                        value={w.instructions ?? ""}
                        onChange={(e) => {
                          const wallets = [...value.methods.crypto.wallets]
                          wallets[idx] = { ...wallets[idx], instructions: e.target.value }
                          onChange({
                            ...value,
                            methods: { ...value.methods, crypto: { ...value.methods.crypto, wallets } },
                          })
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-row flex-wrap items-center gap-2 sm:flex-col sm:items-stretch sm:justify-center">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id={walletInputId}
                    onChange={(ev) => {
                      const f = ev.target.files?.[0]
                      void uploadQrForWallet(idx, f ?? null)
                      ev.target.value = ""
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => document.getElementById(walletInputId)?.click()}
                  >
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    {w.qrCodeUrl || blobPreviewById[w.id] ? "Replace" : "Upload"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 text-xs text-destructive hover:text-destructive"
                    onClick={() => {
                      clearBlobPreviewForId(w.id)
                      const wallets = value.methods.crypto.wallets.filter((_, i) => i !== idx)
                      onChange({
                        ...value,
                        methods: {
                          ...value.methods,
                          crypto: { ...value.methods.crypto, wallets },
                        },
                      })
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              </div>
            )
          })}
        </section>
          </TabsContent>

          <TabsContent value="more" className="m-0 space-y-4 px-4 py-4 sm:px-5">
            <Accordion type="multiple" defaultValue={["cheque", "external", "support"]} className="w-full space-y-2">
              <AccordionItem value="cheque" className="rounded-lg border border-border/80 border-b bg-muted/10 px-3 last:border-b">
                <AccordionTrigger className="py-3 text-sm hover:no-underline data-[state=open]:pb-2">
                  <span className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" />
                    Cheque / DD
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={value.methods.cheque.enabled}
                      onCheckedChange={(enabled) =>
                        onChange({
                          ...value,
                          methods: { ...value.methods, cheque: { ...value.methods.cheque, enabled } },
                        })
                      }
                    />
                    <Label className="text-xs font-normal text-muted-foreground">Show in deposit flow</Label>
                  </div>
                  <Textarea
                    className="min-h-[72px] text-sm"
                    placeholder="Instructions for payers"
                    value={value.methods.cheque.instructions ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        methods: {
                          ...value.methods,
                          cheque: { ...value.methods.cheque, instructions: e.target.value },
                        },
                      })
                    }
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="external" className="rounded-lg border border-border/80 border-b bg-muted/10 px-3 last:border-b">
                <AccordionTrigger className="py-3 text-sm hover:no-underline data-[state=open]:pb-2">
                  <span className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    External payment link
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={value.methods.externalGateway.enabled}
                      onCheckedChange={(enabled) =>
                        onChange({
                          ...value,
                          methods: {
                            ...value.methods,
                            externalGateway: { ...value.methods.externalGateway, enabled },
                          },
                        })
                      }
                    />
                    <Label className="text-xs font-normal text-muted-foreground">Show in deposit flow</Label>
                  </div>
                  <Input
                    className="h-9 text-sm"
                    placeholder="Button label"
                    value={value.methods.externalGateway.buttonLabel}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        methods: {
                          ...value.methods,
                          externalGateway: {
                            ...value.methods.externalGateway,
                            buttonLabel: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <Input
                    className="h-9 text-sm"
                    placeholder="https://…"
                    value={value.methods.externalGateway.url}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        methods: {
                          ...value.methods,
                          externalGateway: {
                            ...value.methods.externalGateway,
                            url: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <Textarea
                    className="min-h-[56px] text-sm"
                    placeholder="Disclaimer (optional)"
                    value={value.methods.externalGateway.disclaimer ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        methods: {
                          ...value.methods,
                          externalGateway: {
                            ...value.methods.externalGateway,
                            disclaimer: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="support" className="rounded-lg border border-border/80 border-b bg-muted/10 px-3 last:border-b">
                <AccordionTrigger className="py-3 text-sm hover:no-underline data-[state=open]:pb-2">
                  <span className="flex items-center gap-2">
                    <LifeBuoy className="h-4 w-4 shrink-0 text-muted-foreground" />
                    Contact / support block
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={value.methods.contactSupport.enabled}
                      onCheckedChange={(enabled) =>
                        onChange({
                          ...value,
                          methods: {
                            ...value.methods,
                            contactSupport: { ...value.methods.contactSupport, enabled },
                          },
                        })
                      }
                    />
                    <Label className="text-xs font-normal text-muted-foreground">Show in deposit flow</Label>
                  </div>
                  <Input
                    className="h-9 text-sm"
                    placeholder="Title"
                    value={value.methods.contactSupport.title ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        methods: {
                          ...value.methods,
                          contactSupport: {
                            ...value.methods.contactSupport,
                            title: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <Textarea
                    className="min-h-[64px] text-sm"
                    placeholder="Body"
                    value={value.methods.contactSupport.body ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        methods: {
                          ...value.methods,
                          contactSupport: {
                            ...value.methods.contactSupport,
                            body: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(["phone", "email", "whatsapp"] as const).map((k) => (
                      <div key={k} className="space-y-1">
                        <Label className="text-xs capitalize text-muted-foreground">{k}</Label>
                        <Input
                          className="h-9 text-sm"
                          value={(value.methods.contactSupport as any)[k] ?? ""}
                          onChange={(e) =>
                            onChange({
                              ...value,
                              methods: {
                                ...value.methods,
                                contactSupport: {
                                  ...value.methods.contactSupport,
                                  [k]: e.target.value,
                                },
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
