/**
 * File:        components/trading/widgets/terminal-watchlist.tsx
 * Module:      components/trading/widgets
 * Purpose:     Full-featured dark watchlist for the desktop trading terminal.
 *              Shows ALL user watchlists as horizontally scrollable tabs, live LTP + change%,
 *              search filter, hover B/S/× actions, add-stock via StockSearch, and
 *              create/edit/delete watchlist dialogs — matching mobile WatchlistManager features
 *              but in the dark terminal oklch design system.
 *
 * Exports:
 *   - TerminalWatchlist(props) — 300px dark left-rail watchlist
 *
 * Depends on:
 *   - @/lib/hooks/use-prisma-watchlist — useEnhancedWatchlists, useWatchlistItems,
 *                                        WatchlistItemData, WatchlistData
 *   - @/lib/market-data/utils/quote-lookup — resolveQuoteFromMap, resolveDisplayPriceFromQuote,
 *                                            parsePositiveIntegerMarketNumber
 *   - @/components/watchlist/CreateWatchlistDialog — create watchlist dialog
 *   - @/components/watchlist/EditWatchlistDialog   — edit/delete watchlist dialog
 *   - @/components/stock-search — StockSearch (add stock to watchlist)
 *   - next-auth/react — useSession for userId
 *
 * Side-effects:
 *   - SWR fetch for user watchlists (deduplicated with WatchlistManager via same key /api/watchlists)
 *   - API calls for create/update/delete watchlist and add/remove items (via hooks)
 *
 * Key invariants:
 *   - Quotes are dual-keyed by broker token AND uirId; always pass both to resolveQuoteFromMap
 *   - change% = (ltp - item.close) / item.close × 100; falls back to 0 when close is 0
 *   - ALL watchlists shown as horizontal scrollable tabs (not capped at 3)
 *   - Row hover: B · S · × (quick buy / sell / remove from watchlist)
 *   - Selected row highlighted with cyan tint
 *
 * Read order:
 *   1. TerminalWatchlistProps — data contract
 *   2. resolveItemLtp — live price helper
 *   3. WatchlistRow — row render
 *   4. TerminalWatchlist — shell + tab logic
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-23
 */

"use client"

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { Search, Plus, MoreHorizontal, Trash2, Pencil } from "lucide-react"
import { useSession } from "next-auth/react"
import {
  useEnhancedWatchlists,
  useWatchlistItems,
  type WatchlistItemData,
  type WatchlistData,
} from "@/lib/hooks/use-prisma-watchlist"
import {
  resolveQuoteFromMap,
  resolveDisplayPriceFromQuote,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"
import { CreateWatchlistDialog } from "@/components/watchlist/CreateWatchlistDialog"
import { EditWatchlistDialog } from "@/components/watchlist/EditWatchlistDialog"
import { StockSearch } from "@/components/stock-search"

export interface TerminalWatchlistProps {
  quotes: Record<string, any> | undefined
  selectedInstrumentId?: string | null
  onSelectItem: (item: WatchlistItemData) => void
  onQuickBuy: (item: WatchlistItemData) => void
  onQuickSell: (item: WatchlistItemData) => void
}

// ── Price helpers ─────────────────────────────────────────────
function resolveItemLtp(item: WatchlistItemData, quotes: Record<string, any> | undefined): number | null {
  const token = parsePositiveIntegerMarketNumber(item.token)
  const quote = resolveQuoteFromMap(quotes, { token: token ?? undefined, uirId: item.uirId, instrumentId: item.instrumentId })
  if (!quote) return null
  return resolveDisplayPriceFromQuote(quote, 0) || null
}

const fmtLtp = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Row component ─────────────────────────────────────────────
interface WatchlistRowProps {
  item: WatchlistItemData
  quotes: Record<string, any> | undefined
  isSelected: boolean
  onSelect: () => void
  onBuy: () => void
  onSell: () => void
  onRemove: () => void
}

// Equality check that gates row re-renders on actual visible changes only.
// Without this, every parent re-render (search input keystroke, tab click,
// or any tick-driven quotes update) re-renders every row in the watchlist:
//   - The parent passes inline arrow handlers (onSelect, onBuy, onSell, onRemove)
//     which are fresh refs every render, so default shallow equality always says
//     "props differ" and React.memo does nothing.
//   - quotes is a fresh object reference on every meaningful market tick, again
//     defeating shallow equality.
// We therefore intentionally IGNORE the handler refs (they always invoke the
// same intent for the same item) and walk only this row's relevant price out
// of next.quotes — same pattern PositionTracking and WatchlistItemCard use.
function areWatchlistRowPropsEqual(prev: WatchlistRowProps, next: WatchlistRowProps): boolean {
  if (prev.item.id !== next.item.id) return false
  if (prev.item.token !== next.item.token) return false
  if (prev.isSelected !== next.isSelected) return false
  if (prev.item.symbol !== next.item.symbol) return false
  if (prev.item.segment !== next.item.segment) return false
  if (prev.item.exchange !== next.item.exchange) return false
  if (prev.item.close !== next.item.close) return false
  // Compare the live LTP of THIS row's token. resolveItemLtp uses the same
  // identity resolver the row body uses to render the price, so this is exact.
  const prevLtp = resolveItemLtp(prev.item, prev.quotes)
  const nextLtp = resolveItemLtp(next.item, next.quotes)
  if (prevLtp !== nextLtp) return false
  // Handler refs intentionally NOT compared — see comment above.
  return true
}

const WatchlistRow = React.memo(function WatchlistRow({
  item, quotes, isSelected, onSelect, onBuy, onSell, onRemove,
}: WatchlistRowProps) {
  const [hovered, setHovered] = useState(false)
  // Flash direction tracks the last tick direction for the green/red price flash animation
  const [flashDir, setFlashDir] = useState<"up" | "down" | null>(null)
  const prevLtpRef = useRef<number | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ltp = resolveItemLtp(item, quotes)
  const displayLtp = ltp ?? (item.ltp > 0 ? item.ltp : null)
  const close = item.close
  const changePct = ltp && close && close > 0 ? ((ltp - close) / close) * 100 : null
  const isUp = changePct != null ? changePct >= 0 : null
  const segment = (item.segment ?? item.exchange ?? "NSE").toUpperCase()

  // Trigger flash when LTP changes direction — same rhythm as Obsidian's 700ms tick
  useEffect(() => {
    if (ltp === null) return
    const prev = prevLtpRef.current
    if (prev !== null && ltp !== prev) {
      const dir = ltp > prev ? "up" : "down"
      setFlashDir(dir)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setFlashDir(null), 420)
    }
    prevLtpRef.current = ltp
  }, [ltp])

  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current) }, [])

  const flashBg =
    flashDir === "up"
      ? "rgba(16, 217, 150, 0.14)"
      : flashDir === "down"
        ? "rgba(255, 59, 92, 0.12)"
        : null

  const upColor = "var(--terminal-up, #10D996)"
  const dnColor = "var(--terminal-dn, #FF3B5C)"
  const priceColor = isUp === null ? "oklch(0.7 0 0)" : isUp ? upColor : dnColor
  const changePillBg = isUp === null ? "transparent" : isUp ? "var(--terminal-up-dim, rgba(16,217,150,.10))" : "var(--terminal-dn-dim, rgba(255,59,92,.10))"

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative"
      style={{
        padding: "9px 14px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        cursor: "pointer",
        borderBottom: "1px solid var(--terminal-border)",
        borderLeft: isSelected ? "2px solid var(--terminal-accent, #22D3EE)" : "2px solid transparent",
        paddingLeft: isSelected ? 12 : 14,
        background: flashBg ?? (isSelected
          ? "var(--terminal-accent-dim, rgba(34,211,238,.08))"
          : hovered
            ? "var(--terminal-surface-hi)"
            : "transparent"),
        transition: flashBg ? "background 60ms" : "background 80ms",
        boxShadow: flashDir === "up" ? "inset 0 0 0 1px rgba(16,217,150,.15)" : flashDir === "down" ? "inset 0 0 0 1px rgba(255,59,92,.10)" : "none",
      }}
    >
      {/* Left: symbol + segment */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700,
          color: isSelected ? "var(--terminal-accent, #22D3EE)" : "var(--terminal-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          letterSpacing: "-0.2px",
        }}>
          {item.symbol}
        </div>
        <div style={{
          fontSize: 9, color: "var(--terminal-text-muted)", fontWeight: 600,
          letterSpacing: "0.07em", textTransform: "uppercase", marginTop: 2,
        }}>
          {segment}
        </div>
      </div>

      {/* Right: ltp + change pill OR hover actions */}
      {hovered ? (
        <div style={{ display: "flex", gap: 3 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onBuy() }}
            style={{
              background: "var(--terminal-up, #10D996)", color: "#000",
              border: 0, borderRadius: 5, padding: "4px 9px", fontSize: 11, fontWeight: 800,
              cursor: "pointer", letterSpacing: "0.02em",
            }}
          >
            B
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSell() }}
            style={{
              background: "var(--terminal-dn, #FF3B5C)", color: "#fff",
              border: 0, borderRadius: 5, padding: "4px 9px", fontSize: 11, fontWeight: 800,
              cursor: "pointer", letterSpacing: "0.02em",
            }}
          >
            S
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            style={{
              background: "var(--terminal-hover)", color: "var(--terminal-text-muted)",
              border: "1px solid var(--terminal-separator, rgba(255,255,255,.06))",
              borderRadius: 5, padding: "4px 7px", fontSize: 12, cursor: "pointer",
            }}
            title="Remove from watchlist"
          >
            ×
          </button>
        </div>
      ) : (
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: 14,
            fontFamily: "var(--font-mono, monospace)",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 700,
            color: priceColor,
            transition: "color 120ms",
          }}>
            {displayLtp != null ? fmtLtp(displayLtp) : "—"}
          </div>
          {changePct != null && (
            <div style={{
              display: "inline-block",
              marginTop: 2,
              padding: "1px 5px",
              borderRadius: 3,
              background: changePillBg,
              fontSize: 10,
              fontFamily: "var(--font-mono, monospace)",
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: priceColor,
              transition: "color 120ms",
            }}>
              {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
            </div>
          )}
          {changePct === null && (
            <div style={{ fontSize: 10, color: "oklch(0.45 0 0)", marginTop: 2 }}>—</div>
          )}
        </div>
      )}
    </div>
  )
}, areWatchlistRowPropsEqual)

// ── Main component ─────────────────────────────────────────────
export function TerminalWatchlist({
  quotes,
  selectedInstrumentId,
  onSelectItem,
  onQuickBuy,
  onQuickSell,
}: TerminalWatchlistProps) {
  const { data: session } = useSession()
  const userId = (session?.user as any)?.id as string | undefined

  const {
    watchlists,
    isLoading,
    createWatchlist,
    updateWatchlist,
    deleteWatchlist,
  } = useEnhancedWatchlists(userId)

  const [activeTabId, setActiveTabId] = useState<string>("")
  const [search, setSearch] = useState("")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingWatchlist, setEditingWatchlist] = useState<WatchlistData | null>(null)
  const [showSearchDialog, setShowSearchDialog] = useState(false)
  const [tabMenuOpenId, setTabMenuOpenId] = useState<string | null>(null)

  const { addItem, removeItem } = useWatchlistItems(activeTabId || undefined)

  // Sync active tab when watchlists load or change
  useEffect(() => {
    if (watchlists.length === 0) return
    if (!activeTabId || !watchlists.some((w) => w.id === activeTabId)) {
      const def = watchlists.find((w) => w.isDefault) ?? watchlists[0]
      if (def) setActiveTabId(def.id)
    }
  }, [watchlists, activeTabId])

  const activeWatchlist = useMemo(
    () => watchlists.find((w) => w.id === activeTabId) ?? null,
    [watchlists, activeTabId],
  )

  const activeWatchlistTokens = useMemo(() => {
    const tokens: number[] = []
    for (const item of activeWatchlist?.items ?? []) {
      const t = parsePositiveIntegerMarketNumber(item.token)
      if (t !== null) tokens.push(t)
    }
    return tokens
  }, [activeWatchlist])

  const filteredItems = useMemo(() => {
    const items = activeWatchlist?.items ?? []
    if (!search.trim()) return items
    const q = search.trim().toLowerCase()
    return items.filter((it) => it.symbol.toLowerCase().includes(q) || (it.name ?? "").toLowerCase().includes(q))
  }, [activeWatchlist, search])

  // ── Handlers ────────────────────────────────────────────────
  const handleCreateWatchlist = useCallback(
    async (data: { name: string; description?: string; color?: string; isDefault?: boolean }) => {
      await createWatchlist(data)
      setShowCreateDialog(false)
    },
    [createWatchlist],
  )

  const handleEditWatchlist = useCallback(
    async (data: { name?: string; description?: string; color?: string; isDefault?: boolean }) => {
      if (!editingWatchlist) return
      await updateWatchlist(editingWatchlist.id, data)
      setShowEditDialog(false)
      setEditingWatchlist(null)
    },
    [editingWatchlist, updateWatchlist],
  )

  const handleDeleteWatchlist = useCallback(
    async (watchlistId: string) => {
      await deleteWatchlist(watchlistId)
      if (activeTabId === watchlistId) setActiveTabId("")
      setShowEditDialog(false)
    },
    [deleteWatchlist, activeTabId],
  )

  const handleAddStock = useCallback(
    async (stockData: any) => {
      await addItem(stockData)
      setShowSearchDialog(false)
    },
    [addItem],
  )

  const handleRemoveItem = useCallback(
    async (itemId: string) => {
      await removeItem(itemId)
    },
    [removeItem],
  )

  // Compute advance/decline counts for footer from live quotes
  const adCounts = useMemo(() => {
    let up = 0, dn = 0
    for (const item of filteredItems) {
      const token = parsePositiveIntegerMarketNumber(item.token)
      const q = resolveQuoteFromMap(quotes, { token: token ?? undefined, uirId: item.uirId, instrumentId: item.instrumentId })
      const ltp = q ? resolveDisplayPriceFromQuote(q, 0) : null
      if (ltp && item.close && item.close > 0) {
        if (ltp >= item.close) up++; else dn++
      }
    }
    return { up, dn }
  }, [filteredItems, quotes])

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--terminal-surface)",
        overflow: "hidden",
      }}
    >
      {/* ── Panel title strip ── */}
      <div
        style={{
          height: 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px 0 14px",
          flexShrink: 0,
          borderBottom: "1px solid var(--terminal-separator, rgba(255,255,255,.06))",
          background: "var(--terminal-surface)",
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--terminal-text-muted)" }}>
          Watchlists
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setShowSearchDialog(true)}
            disabled={!activeTabId}
            title="Add symbol"
            style={{
              background: "transparent", border: "1px solid var(--terminal-separator, rgba(255,255,255,.08))",
              borderRadius: 4, padding: "3px 6px", cursor: activeTabId ? "pointer" : "not-allowed",
              color: activeTabId ? "var(--terminal-accent, #22D3EE)" : "var(--terminal-text-muted)",
              display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700,
            }}
          >
            <Plus size={10} /> Add
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            title="New watchlist"
            style={{
              background: "transparent", border: "1px solid var(--terminal-separator, rgba(255,255,255,.08))",
              borderRadius: 4, padding: "3px 6px", cursor: "pointer",
              color: "var(--terminal-text-muted)", display: "flex", alignItems: "center",
            }}
          >
            <Plus size={10} />
          </button>
        </div>
      </div>

      {/* ── Watchlist tab chips ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          overflowX: "auto",
          scrollbarWidth: "none",
          padding: "6px 8px",
          gap: 4,
          flexShrink: 0,
          borderBottom: "1px solid var(--terminal-border)",
          background: "var(--terminal-bg)",
        }}
      >
        {watchlists.map((wl) => {
          const isActive = activeTabId === wl.id
          return (
            <div key={wl.id} style={{ position: "relative", flexShrink: 0 }}>
              <button
                onClick={() => { setActiveTabId(wl.id); setTabMenuOpenId(null) }}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  border: isActive ? "1px solid var(--terminal-accent-border, rgba(34,211,238,.25))" : "1px solid transparent",
                  borderRadius: 4,
                  background: isActive ? "var(--terminal-accent-dim, rgba(34,211,238,.12))" : "transparent",
                  color: isActive ? "var(--terminal-accent, #22D3EE)" : "var(--terminal-text-muted)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "color 100ms, background 100ms, border-color 100ms",
                  height: 26,
                }}
                title={wl.name}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--terminal-text)" }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--terminal-text-muted)" }}
              >
                {wl.color && (
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: wl.color, flexShrink: 0 }} />
                )}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 72 }}>
                  {wl.name.length > 9 ? wl.name.slice(0, 8) + "…" : wl.name}
                </span>
                {/* Edit menu trigger */}
                {isActive && (
                  <span
                    onClick={(e) => { e.stopPropagation(); setTabMenuOpenId((p) => (p === wl.id ? null : wl.id)) }}
                    style={{ marginLeft: 2, opacity: 0.6, lineHeight: 1 }}
                  >
                    <MoreHorizontal size={10} />
                  </span>
                )}
              </button>

              {/* Dropdown */}
              {tabMenuOpenId === wl.id && (
                <div
                  style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
                    background: "var(--terminal-hover)", border: "1px solid var(--terminal-border)",
                    borderRadius: 8, padding: 4, minWidth: 140, boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                  }}
                  onMouseLeave={() => setTabMenuOpenId(null)}
                >
                  <button
                    onClick={() => { setEditingWatchlist(wl); setShowEditDialog(true); setTabMenuOpenId(null) }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: 0, background: "transparent", color: "var(--terminal-text)", fontSize: 12, cursor: "pointer", borderRadius: 5 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--terminal-surface-hi)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Pencil size={11} /> Rename
                  </button>
                  <button
                    onClick={() => { handleDeleteWatchlist(wl.id); setTabMenuOpenId(null) }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: 0, background: "transparent", color: "var(--terminal-dn, #EF4444)", fontSize: 12, cursor: "pointer", borderRadius: 5 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--terminal-surface-hi)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Search row ── */}
      <div style={{ padding: "7px 10px", flexShrink: 0, borderBottom: "1px solid var(--terminal-border)", background: "var(--terminal-surface)" }}>
        <div style={{ position: "relative" }}>
          <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--terminal-text-muted)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Filter symbols…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "5px 10px 5px 26px",
              fontSize: 11,
              border: "1px solid var(--terminal-border)",
              borderRadius: 6,
              background: "var(--terminal-bg)",
              color: "var(--terminal-text)",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 120ms",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,.35)" }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--terminal-border)" }}
          />
        </div>
      </div>

      {/* ── Column headers ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          padding: "5px 14px",
          background: "var(--terminal-surface-hi)",
          borderBottom: "1px solid var(--terminal-border)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--terminal-text-muted)" }}>Symbol</span>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--terminal-text-muted)", textAlign: "right" }}>LTP / Chg%</span>
      </div>

      {/* ── Symbol rows ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {isLoading && filteredItems.length === 0 ? (
          <div style={{ padding: "16px 14px" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 44, background: "var(--terminal-surface-hi)", borderRadius: 4, marginBottom: 4, opacity: 1 - i * 0.13 }} />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 100, gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--terminal-text-muted)" }}>
              {search ? "No matches" : activeWatchlist ? "Empty — click Add to add symbols" : "Select a watchlist"}
            </span>
          </div>
        ) : (
          filteredItems.map((item) => (
            <WatchlistRow
              key={item.id}
              item={item}
              quotes={quotes}
              isSelected={selectedInstrumentId === item.instrumentId}
              onSelect={() => onSelectItem(item)}
              onBuy={() => onQuickBuy(item)}
              onSell={() => onQuickSell(item)}
              onRemove={() => handleRemoveItem(item.watchlistItemId ?? item.id)}
            />
          ))
        )}
      </div>

      {/* ── Footer: count + advance/decline ── */}
      {activeWatchlist && (
        <div
          style={{
            padding: "5px 12px",
            borderTop: "1px solid var(--terminal-separator, rgba(255,255,255,.06))",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
            background: "var(--terminal-surface)",
          }}
        >
          <span style={{ fontSize: 9, color: "var(--terminal-text-muted)", fontWeight: 600 }}>
            {filteredItems.length} symbol{filteredItems.length !== 1 ? "s" : ""}
            {activeWatchlist.items?.length !== filteredItems.length && ` / ${activeWatchlist.items?.length ?? 0}`}
          </span>
          <div style={{ display: "flex", gap: 8, fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>
            <span style={{ color: "var(--terminal-up, #10D996)" }}>↑{adCounts.up}</span>
            <span style={{ color: "var(--terminal-dn, #FF3B5C)" }}>↓{adCounts.dn}</span>
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}
      <CreateWatchlistDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={handleCreateWatchlist}
      />
      <EditWatchlistDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        watchlist={editingWatchlist}
        onUpdate={handleEditWatchlist}
        onDelete={handleDeleteWatchlist}
      />
      <StockSearch
        open={showSearchDialog}
        onOpenChange={setShowSearchDialog}
        onAddStock={handleAddStock}
        onClose={() => setShowSearchDialog(false)}
        existingTokens={activeWatchlistTokens}
      />
    </div>
  )
}
