/**
 * @file MarketCatalogEditor.tsx
 * @module components/admin-console/market-data
 * @description Admin editor for MARKET_CATALOG_V1 — the curated catalog of groups + items
 *              (instruments + options-chain recipes) shown to end users in the watchlist Add
 *              drawer's Browse mode. Two-pane layout: left rail = groups list with reorder &
 *              add/remove; right pane = selected group's metadata + items.
 *
 *              Exposes an imperative handle so MarketDataAdminPage's orchestrated header Save
 *              button can flush dirty catalog state alongside the other tabs (mirrors the
 *              MarketControlPanel `marketControlRef.current?.saveAll()` pattern).
 *
 * Exports:
 *   - MarketCatalogEditor — forwardRef component; props { onDirtyChange?: (dirty: boolean) => void }
 *   - MarketCatalogEditorHandle — { saveAll, reload, isDirty }
 *
 * Side-effects:
 *   - GET  /api/admin/market-data/catalog on mount + reload
 *   - PUT  /api/admin/market-data/catalog on saveAll
 *
 * Key invariants:
 *   - Local draft state is the single source of truth while the user is editing.
 *   - onDirtyChange is the parent's signal to update its dirty-dot UI.
 *   - reload() always resets dirty to false.
 *
 * Read order:
 *   1. MarketCatalogEditorHandle — public contract.
 *   2. fetch / save logic.
 *   3. JSX (left rail → group editor → items list).
 *
 * @author        BharatERP
 * @created       2026-05-01
 */

"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { Plus, Sparkles, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  DEFAULT_MARKET_CATALOG_V1,
  type CatalogGroup,
  type CatalogItem,
  type InstrumentItem,
  type MarketCatalogV1,
  type OptionsChainItem,
} from "@/lib/market-catalog/catalog-schema"
import {
  AdminStockSearchDialog,
  type PickedInstrument,
} from "./catalog-editor/AdminStockSearchDialog"
import { InstrumentItemRow } from "./catalog-editor/InstrumentItemRow"
import { OptionsChainItemRow } from "./catalog-editor/OptionsChainItemRow"

export interface MarketCatalogEditorHandle {
  saveAll: () => Promise<void>
  reload: () => Promise<void>
  isDirty: () => boolean
}

export interface MarketCatalogEditorProps {
  onDirtyChange?: (dirty: boolean) => void
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || `g-${Date.now()}`

const moveItem = <T,>(arr: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= arr.length) return arr
  const next = [...arr]
  const [picked] = next.splice(from, 1)
  next.splice(to, 0, picked!)
  return next
}

export const MarketCatalogEditor = forwardRef<MarketCatalogEditorHandle, MarketCatalogEditorProps>(
  function MarketCatalogEditor({ onDirtyChange }, ref) {
    const [draft, setDraft] = useState<MarketCatalogV1>(DEFAULT_MARKET_CATALOG_V1)
    const [serverSnapshot, setServerSnapshot] = useState<MarketCatalogV1>(
      DEFAULT_MARKET_CATALOG_V1,
    )
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    /**
     * Picker intent — null = closed, "instrument" = adding a fixed instrument row,
     * "options-chain-underlying" = picking the underlying for a new options-chain recipe.
     * Encoding the intent on the state (rather than a boolean) lets one dialog instance
     * serve both add-flows and lets the pick callback branch correctly. It also prevents
     * the previous bug where "Add options chain" inserted a row with `underlying.token = 0`
     * that failed Zod's `.positive()` validation on save.
     */
    const [pickerIntent, setPickerIntent] = useState<
      null | "instrument" | "options-chain-underlying"
    >(null)
    const onDirtyChangeRef = useRef(onDirtyChange)

    useEffect(() => {
      onDirtyChangeRef.current = onDirtyChange
    }, [onDirtyChange])

    const dirty = useMemo(
      () => JSON.stringify(stripUpdatedAt(draft)) !== JSON.stringify(stripUpdatedAt(serverSnapshot)),
      [draft, serverSnapshot],
    )

    useEffect(() => {
      onDirtyChangeRef.current?.(dirty)
    }, [dirty])

    const reload = useCallback(async () => {
      setLoading(true)
      try {
        const res = await fetch("/api/admin/market-data/catalog", { cache: "no-store" })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || "load failed")
        const fresh: MarketCatalogV1 = data.data ?? DEFAULT_MARKET_CATALOG_V1
        setDraft(fresh)
        setServerSnapshot(fresh)
        if (fresh.groups.length && !fresh.groups.some((g) => g.id === selectedGroupId)) {
          setSelectedGroupId(fresh.groups[0]!.id)
        }
      } catch (e) {
        toast({
          title: "Catalog load failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      void reload()
    }, [reload])

    const saveAll = useCallback(async () => {
      const payload: MarketCatalogV1 = { ...draft }
      const res = await fetch("/api/admin/market-data/catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        const msg = data?.error || data?.message || `HTTP ${res.status}`
        toast({ title: "Catalog save failed", description: msg, variant: "destructive" })
        throw new Error(msg)
      }
      const persisted: MarketCatalogV1 = data.data
      setDraft(persisted)
      setServerSnapshot(persisted)
      toast({ title: "Catalog saved", description: `${persisted.groups.length} group(s) live` })
    }, [draft])

    useImperativeHandle(ref, () => ({ saveAll, reload, isDirty: () => dirty }), [
      saveAll,
      reload,
      dirty,
    ])

    // ── Group helpers ────────────────────────────────────────────────────

    const selectedGroup = useMemo(
      () => draft.groups.find((g) => g.id === selectedGroupId) ?? null,
      [draft.groups, selectedGroupId],
    )

    const updateGroup = useCallback(
      (id: string, mutator: (g: CatalogGroup) => CatalogGroup) => {
        setDraft((prev) => ({
          ...prev,
          groups: prev.groups.map((g) => (g.id === id ? mutator(g) : g)),
        }))
      },
      [],
    )

    const addGroup = useCallback(() => {
      const id = `group-${Date.now().toString(36)}`
      setDraft((prev) => ({
        ...prev,
        groups: [
          ...prev.groups,
          { id, label: "New Group", sortOrder: prev.groups.length, items: [] },
        ],
      }))
      setSelectedGroupId(id)
    }, [])

    const removeGroup = useCallback(
      (id: string) => {
        setDraft((prev) => ({ ...prev, groups: prev.groups.filter((g) => g.id !== id) }))
        if (selectedGroupId === id) setSelectedGroupId(null)
      },
      [selectedGroupId],
    )

    const moveGroup = useCallback((id: string, dir: -1 | 1) => {
      setDraft((prev) => {
        const idx = prev.groups.findIndex((g) => g.id === id)
        if (idx < 0) return prev
        const moved = moveItem(prev.groups, idx, idx + dir)
        return { ...prev, groups: moved.map((g, i) => ({ ...g, sortOrder: i })) }
      })
    }, [])

    // ── Item helpers ─────────────────────────────────────────────────────

    const updateItems = useCallback(
      (groupId: string, mutator: (items: CatalogItem[]) => CatalogItem[]) => {
        updateGroup(groupId, (g) => ({ ...g, items: mutator(g.items) }))
      },
      [updateGroup],
    )

    const onPickInstrument = useCallback(
      (picked: PickedInstrument) => {
        if (!selectedGroup) return
        if (pickerIntent === "options-chain-underlying") {
          const stub: OptionsChainItem = {
            kind: "options-chain",
            underlying: {
              token: picked.token,
              symbol: picked.symbol,
              segment: picked.segment,
            },
            expiryStrategy: { mode: "next-n-weekly", count: 3 },
            strikeStrategy: { mode: "atm-window", window: 5 },
            includeCE: true,
            includePE: true,
          }
          updateItems(selectedGroup.id, (items) => [...items, stub])
          return
        }
        const newItem: InstrumentItem = {
          kind: "instrument",
          token: picked.token,
          symbol: picked.symbol,
          name: picked.name,
          exchange: picked.exchange,
          segment: picked.segment,
        }
        updateItems(selectedGroup.id, (items) => [...items, newItem])
      },
      [selectedGroup, updateItems, pickerIntent],
    )

    // ── Render ───────────────────────────────────────────────────────────

    return (
      <Card className="border-border/60">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
            {/* Left rail: groups */}
            <div className="border-r border-border/40 bg-muted/20 p-3 space-y-2 min-h-[420px]">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Groups
                </Label>
                <Button type="button" size="sm" variant="outline" onClick={addGroup} className="h-7 px-2">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-1">
                {draft.groups.length === 0 && !loading && (
                  <div className="text-xs text-muted-foreground px-2 py-4 text-center">
                    No groups yet. Click <span className="font-semibold">Add</span> to start.
                  </div>
                )}
                {draft.groups.map((g, i) => (
                  <div
                    key={g.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-md p-1",
                      selectedGroupId === g.id ? "bg-background border border-border/60" : "hover:bg-background/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedGroupId(g.id)}
                      className="flex-1 min-w-0 px-2 py-1 text-left"
                    >
                      <div className="text-sm font-medium text-foreground truncate">{g.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {g.items.length} item{g.items.length === 1 ? "" : "s"}
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      disabled={i === 0}
                      onClick={() => moveGroup(g.id, -1)}
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      disabled={i === draft.groups.length - 1}
                      onClick={() => moveGroup(g.id, 1)}
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-500 hover:bg-rose-500/10"
                      onClick={() => removeGroup(g.id)}
                      aria-label="Delete group"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Right pane: group editor */}
            <div className="p-4 space-y-4">
              {!selectedGroup ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-primary/70" />
                  </div>
                  <div className="text-sm font-medium">Select or create a group to start curating</div>
                  <div className="text-xs text-muted-foreground max-w-xs">
                    Groups become the rows users see in the Browse drawer (e.g. Indices, Sectors, Options Chains).
                  </div>
                </div>
              ) : (
                <>
                  <GroupMetaEditor
                    group={selectedGroup}
                    onChange={(g) => updateGroup(selectedGroup.id, () => g)}
                  />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                        Items
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setPickerIntent("instrument")}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add instrument
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setPickerIntent("options-chain-underlying")}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add options chain
                        </Button>
                      </div>
                    </div>

                    {selectedGroup.items.length === 0 ? (
                      <div className="text-xs text-muted-foreground px-2 py-6 text-center border border-dashed border-border/40 rounded-lg">
                        No items in this group yet. Use <span className="font-semibold">Add instrument</span>{" "}
                        for a fixed pre-resolved row, or <span className="font-semibold">Add options chain</span>{" "}
                        for a recipe that auto-rolls expiries.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedGroup.items.map((it, idx) => {
                          const onMoveUp = () =>
                            updateItems(selectedGroup.id, (items) => moveItem(items, idx, idx - 1))
                          const onMoveDown = () =>
                            updateItems(selectedGroup.id, (items) => moveItem(items, idx, idx + 1))
                          const onRemove = () =>
                            updateItems(selectedGroup.id, (items) =>
                              items.filter((_, i) => i !== idx),
                            )
                          if (it.kind === "instrument") {
                            return (
                              <InstrumentItemRow
                                key={`inst-${idx}-${it.token}`}
                                item={it}
                                onMoveUp={onMoveUp}
                                onMoveDown={onMoveDown}
                                onRemove={onRemove}
                                isFirst={idx === 0}
                                isLast={idx === selectedGroup.items.length - 1}
                              />
                            )
                          }
                          return (
                            <OptionsChainItemRow
                              key={`oc-${idx}-${it.underlying.token}`}
                              item={it}
                              onChange={(next) =>
                                updateItems(selectedGroup.id, (items) =>
                                  items.map((x, i) => (i === idx ? next : x)),
                                )
                              }
                              onMoveUp={onMoveUp}
                              onMoveDown={onMoveDown}
                              onRemove={onRemove}
                              isFirst={idx === 0}
                              isLast={idx === selectedGroup.items.length - 1}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>

        <AdminStockSearchDialog
          open={pickerIntent !== null}
          onOpenChange={(next) => {
            if (!next) setPickerIntent(null)
          }}
          mode={pickerIntent === "options-chain-underlying" ? "underlying" : "any"}
          title={
            pickerIntent === "options-chain-underlying"
              ? "Pick options-chain underlying"
              : "Add instrument to group"
          }
          onPick={onPickInstrument}
        />
      </Card>
    )
  },
)

interface GroupMetaEditorProps {
  group: CatalogGroup
  onChange: (g: CatalogGroup) => void
}

function GroupMetaEditor({ group, onChange }: GroupMetaEditorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_140px] gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Label</Label>
        <Input
          value={group.label}
          onChange={(e) =>
            onChange({
              ...group,
              label: e.target.value,
              // Auto-suggest slug only if user hasn't customized it.
              id: group.id.startsWith("group-") ? slugify(e.target.value) || group.id : group.id,
            })
          }
          className="h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Description (optional)</Label>
        <Textarea
          value={group.description ?? ""}
          onChange={(e) => onChange({ ...group, description: e.target.value || undefined })}
          rows={1}
          className="resize-none min-h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Icon (lucide name)</Label>
        <Input
          value={group.icon ?? ""}
          onChange={(e) => onChange({ ...group, icon: e.target.value || undefined })}
          placeholder="layers"
          className="h-9"
        />
      </div>
    </div>
  )
}

function stripUpdatedAt(c: MarketCatalogV1): MarketCatalogV1 {
  const { updatedAt: _ignored, ...rest } = c
  return rest
}
