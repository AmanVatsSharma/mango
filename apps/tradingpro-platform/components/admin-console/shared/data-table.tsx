/**
 * @file data-table.tsx
 * @module admin-console/shared
 * @description Enhanced data table component combining best features from all admin console components
 * @author StockTrade
 * @created 2025-01-27
 */

"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { motion } from "framer-motion"
import { ReactNode } from "react"

export interface TableColumn<T = any> {
  key: string
  header: string
  accessor?: (row: T) => ReactNode
  className?: string
  headerClassName?: string
}

interface DataTableProps<T = any> {
  data: T[]
  columns: TableColumn<T>[]
  loading?: boolean
  emptyMessage?: string
  loadingMessage?: string
  title?: string
  titleIcon?: ReactNode
  className?: string
  onRowClick?: (row: T) => void
  renderRow?: (row: T, index: number) => ReactNode
  minWidth?: string
}

/**
 * Enhanced Data Table Component
 * 
 * Combines table patterns from:
 * - user-management.tsx (user table)
 * - orders-management.tsx (orders table with inline editing)
 * - positions-management.tsx (positions table)
 * - trade-management.tsx (transactions table)
 * - audit-trail.tsx (audit logs table)
 * - fund-management.tsx (deposits/withdrawals table)
 * - risk-management.tsx (risk limits table)
 * - financial-reports.tsx (reports table)
 * 
 * Features:
 * - Loading states
 * - Empty states
 * - Responsive design
 * - Custom row rendering
 * - Row click handlers
 * - Consistent styling
 * - Animation support
 */
export function DataTable<T = any>({
  data,
  columns,
  loading = false,
  emptyMessage = "No data found",
  loadingMessage = "Loading...",
  title,
  titleIcon,
  className = "",
  onRowClick,
  renderRow,
  minWidth = "1000px"
}: DataTableProps<T>) {
  const defaultRenderRow = (row: T, index: number) => {
    return (
      <TableRow
        key={index}
        className={`border-border hover:bg-muted/30 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
        onClick={() => onRowClick?.(row)}
      >
        {columns.map((column) => {
          const content = column.accessor
            ? column.accessor(row)
            : (row as any)[column.key] || '-'

          return (
            <TableCell
              key={column.key}
              className={column.className || ''}
            >
              {content}
            </TableCell>
          )
        })}
      </TableRow>
    )
  }

  return (
    <Card className={`bg-card border-border shadow-sm neon-border ${className}`}>
      {title && (
        <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-lg sm:text-xl font-bold text-primary flex items-center gap-2">
            {titleIcon}
            {title}
            {data.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({data.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="px-0 sm:px-6 pb-3 sm:pb-6">
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <div style={{ minWidth }} className="sm:min-w-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  {columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className={`text-muted-foreground ${column.headerClassName || ''}`}
                    >
                      {column.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="text-center text-muted-foreground py-10"
                    >
                      {loadingMessage}
                    </TableCell>
                  </TableRow>
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="text-center text-muted-foreground py-10"
                    >
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row, index) => {
                    if (renderRow) {
                      return (
                        <motion.tr
                          key={index}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: index * 0.02 }}
                        >
                          {renderRow(row, index)}
                        </motion.tr>
                      )
                    }
                    return (
                      <motion.tr
                        key={index}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.02 }}
                      >
                        {defaultRenderRow(row, index)}
                      </motion.tr>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
