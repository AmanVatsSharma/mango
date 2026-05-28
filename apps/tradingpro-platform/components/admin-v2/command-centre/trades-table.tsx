/**
 * @file components/admin-v2/command-centre/trades-table.tsx
 * @module admin-v2/command-centre
 * @description Trades blotter table — V2DataTable column defs for TradeRow. Color-coded P&L,
 *              side pills, status pills, click-to-open Client 360 drawer.
 *
 *              Exports: TRADE_COLUMNS — Parameters<typeof V2DataTable<TradeRow>>[0]["columns"].
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import {
  StatusPill,
  V2DataTable,
  useV2TableColumnHelper,
} from "@/components/admin-v2/primitives"
import { formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import type { TradeRow } from "./types"

const colHelper = useV2TableColumnHelper<TradeRow>()

function pnlClass(value: number): string {
  if (value > 0) return "text-[#5DF7BC]"
  if (value < 0) return "text-[#FF8AA0]"
  return "text-[var(--v2-text-mute)]"
}

export const TRADE_COLUMNS = [
  colHelper.display({
    id: "client",
    header: "Client",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="truncate text-sm font-medium text-[var(--v2-text)]">
          {row.original.userName ?? "—"}
        </span>
        <span className="font-mono text-[11px] text-[var(--v2-text-faint)]">
          {row.original.clientId ?? row.original.userId?.slice(0, 8) ?? "—"}
        </span>
      </div>
    ),
  }),
  colHelper.display({
    id: "instrument",
    header: "Instrument",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-mono text-sm font-semibold text-[var(--v2-text)]">
          {row.original.symbol}
        </span>
        <span className="text-[11px] text-[var(--v2-text-faint)]">
          {row.original.segment ?? row.original.exchange ?? ""}
          {row.original.productType ? ` · ${row.original.productType}` : ""}
        </span>
      </div>
    ),
  }),
  colHelper.accessor("side", {
    header: "Side",
    cell: (info) => (
      <StatusPill
        tone={info.getValue() === "LONG" ? "success" : "danger"}
        label={info.getValue()}
        size="sm"
      />
    ),
  }),
  colHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const v = info.getValue()
      const tone =
        v === "OPEN" ? "info" : v === "PARTIAL" ? "warning" : "neutral"
      return <StatusPill tone={tone} label={v} size="sm" />
    },
  }),
  colHelper.display({
    id: "qty",
    header: "Qty",
    cell: ({ row }) => (
      <span className="v2-num text-sm text-[var(--v2-text)]">
        {row.original.openQuantity || row.original.totalQuantity}
      </span>
    ),
  }),
  colHelper.display({
    id: "entry",
    header: "Entry",
    cell: ({ row }) => (
      <span className="v2-num text-sm text-[var(--v2-text)]">
        {row.original.averageEntryPrice.toFixed(2)}
      </span>
    ),
  }),
  colHelper.display({
    id: "ltp",
    header: "LTP / Exit",
    cell: ({ row }) => {
      const v = row.original.ltp ?? row.original.averageExitPrice
      return (
        <span className="v2-num text-sm text-[var(--v2-text)]">
          {v != null ? v.toFixed(2) : "—"}
        </span>
      )
    },
  }),
  colHelper.display({
    id: "pnl",
    header: "P&L",
    cell: ({ row }) => {
      const open = row.original.unrealizedPnL
      const closed = row.original.realizedPnL
      const isOpen = row.original.status === "OPEN" || row.original.status === "PARTIAL"
      const v = isOpen ? open : closed
      return (
        <span className={`v2-num text-sm font-semibold ${pnlClass(v)}`}>
          {formatInr(v)}
        </span>
      )
    },
  }),
  colHelper.display({
    id: "charges",
    header: "Charges",
    cell: ({ row }) => (
      <span className="v2-num text-xs text-[var(--v2-text-mute)]">
        {formatInr(row.original.charges)}
      </span>
    ),
  }),
  colHelper.accessor("entryAt", {
    header: "Entered",
    cell: (info) => (
      <span className="text-xs text-[var(--v2-text-faint)]">
        {formatRelativeIst(info.getValue())}
      </span>
    ),
  }),
] as Parameters<typeof V2DataTable<TradeRow>>[0]["columns"]
