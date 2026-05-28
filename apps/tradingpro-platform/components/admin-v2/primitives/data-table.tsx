/**
 * @file components/admin-v2/primitives/data-table.tsx
 * @module admin-v2/primitives
 * @description TanStack Table + Virtual wrapper styled with the v2 brand tokens — glass card,
 *              gradient header, hover rows with subtle inner glow, sticky bulk-action bar,
 *              skeleton-on-load, designed empty state, error retry. The single canonical
 *              table for v2 lists / queues / workbenches.
 *
 *              Exports:
 *                - V2DataTable<T>         — main component.
 *                - useV2TableColumnHelper — re-export of TanStack `createColumnHelper`.
 *
 *              Side-effects: none.
 *
 *              Key invariants:
 *                - Pure display component. No data fetching, no side-effects.
 *                - `enableVirtual` opt-in; requires `rowHeight` so the virtualizer can compute
 *                  the scroll surface accurately.
 *                - Header is sticky inside its card; the card itself can scroll the body region.
 *
 *              Read order:
 *                1. V2DataTableProps — the contract.
 *                2. V2DataTable — the renderer.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import {
  ColumnDef,
  RowSelectionState,
  SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { EmptyState } from "./empty-state"

export const useV2TableColumnHelper = createColumnHelper

interface V2DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  enableSelection?: boolean
  onSelectionChange?: (selected: T[]) => void
  enableVirtual?: boolean
  rowHeight?: number
  onRowClick?: (row: T) => void
  loading?: boolean
  error?: React.ReactNode
  onRetry?: () => void
  emptyState?: React.ReactNode
  bulkActions?: (selected: T[]) => React.ReactNode
  className?: string
}

export function V2DataTable<T>({
  data,
  columns,
  enableSelection = false,
  onSelectionChange,
  enableVirtual = false,
  rowHeight = 48,
  onRowClick,
  loading = false,
  error,
  onRetry,
  emptyState,
  bulkActions,
  className,
}: V2DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: enableSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const selectedRows = React.useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original),
    [rowSelection, table],
  )

  React.useEffect(() => {
    onSelectionChange?.(selectedRows)
  }, [selectedRows, onSelectionChange])

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const rowsArr = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: enableVirtual ? rowsArr.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  })

  const showEmpty = !loading && !error && rowsArr.length === 0
  const colCount = table.getAllColumns().length

  return (
    <div className={cn("flex flex-col", className)}>
      <div ref={scrollRef} className="v2-card relative max-h-[72vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.02)_100%)] backdrop-blur"
              >
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort()
                  const sorted = h.column.getIsSorted()
                  return (
                    <th
                      key={h.id}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                      className={cn(
                        "select-none border-b border-white/[0.08] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]",
                        canSort && "cursor-pointer transition-colors hover:text-[var(--v2-text)]",
                      )}
                      style={{ width: h.getSize?.() || undefined }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {canSort
                          ? sorted === "asc"
                            ? <ArrowUp className="h-3 w-3 text-[var(--v2-cobalt)]" />
                            : sorted === "desc"
                              ? <ArrowDown className="h-3 w-3 text-[var(--v2-cobalt)]" />
                              : <ArrowUpDown className="h-3 w-3 opacity-30" />
                          : null}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-white/[0.04]">
                  {table.getAllColumns().map((c) => (
                    <td key={c.id} className="px-3 py-3">
                      <Skeleton className="h-4 w-3/4 bg-white/[0.05]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-12 text-center">
                  <div className="space-y-2">
                    <div className="text-sm text-[#FF8AA0]">{error}</div>
                    {onRetry ? (
                      <button
                        onClick={onRetry}
                        className="text-xs font-medium text-[var(--v2-info)] hover:underline"
                      >
                        Retry
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : showEmpty ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-6">
                  {emptyState ?? (
                    <EmptyState
                      title="Nothing here yet"
                      description="No rows match your current filters."
                    />
                  )}
                </td>
              </tr>
            ) : enableVirtual ? (
              <>
                <tr style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0 }} />
                {virtualizer.getVirtualItems().map((vRow) => {
                  const row = rowsArr[vRow.index]
                  return (
                    <tr
                      key={row.id}
                      onClick={() => onRowClick?.(row.original)}
                      className={cn(
                        "border-b border-white/[0.04] transition-colors",
                        onRowClick &&
                          "cursor-pointer hover:bg-[var(--v2-cobalt-soft)] hover:text-[var(--v2-text)]",
                      )}
                      style={{ height: rowHeight }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3 py-2.5 align-middle text-[var(--v2-text)]"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                <tr
                  style={{
                    height:
                      virtualizer.getTotalSize() -
                      (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                  }}
                />
              </>
            ) : (
              rowsArr.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    "border-b border-white/[0.04] transition-colors",
                    onRowClick &&
                      "cursor-pointer hover:bg-[var(--v2-cobalt-soft)]",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-2.5 align-middle text-[var(--v2-text)]"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {enableSelection && bulkActions && selectedRows.length > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky bottom-2 z-20 mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/[0.1] bg-[var(--v2-bg-glass)] px-4 py-2.5 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
        >
          <span className="text-xs text-[var(--v2-text-mute)]">
            <span className="v2-num font-semibold text-[var(--v2-text)]">
              {selectedRows.length}
            </span>{" "}
            selected
          </span>
          <div className="flex items-center gap-2">{bulkActions(selectedRows)}</div>
        </div>
      ) : null}
    </div>
  )
}
