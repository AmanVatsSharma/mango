"use client"

/**
 * @file export-dialog.tsx
 * @module components/console/statements
 * @description Export dialog: downloads full enterprise statement CSV via /api/export (authenticated).
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-30
 */

import { useState } from "react"
import { Download, FileText, File } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/hooks/use-toast"
import type { Transaction } from "./statements-section"

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactions: Transaction[]
  /** When set, statement export uses this window (must match statements section range). */
  statementRange?: { fromIso: string; toIso: string }
}

export function ExportDialog({ open, onOpenChange, transactions, statementRange }: ExportDialogProps) {
  const [format, setFormat] = useState("csv")
  const [isExporting, setIsExporting] = useState(false)
  const { toast } = useToast()

  const handleExport = async () => {
    if (!statementRange) {
      toast({
        title: "Cannot export",
        description: "Statement date range is not available.",
        variant: "destructive",
      })
      return
    }
    if (format === "pdf") {
      toast({
        title: "Not available",
        description: "PDF export is not implemented. Use CSV or ZIP for the audit pack.",
        variant: "destructive",
      })
      return
    }

    setIsExporting(true)
    try {
      const exportFormat = format === "zip" ? "zip" : "csv"
      const params = new URLSearchParams({
        type: "statement",
        startDate: statementRange.fromIso,
        endDate: statementRange.toIso,
        format: exportFormat,
      })
      const res = await fetch(`/api/export?${params.toString()}`, { method: "GET", credentials: "include" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(typeof j?.error === "string" ? j.error : `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const dispo = res.headers.get("Content-Disposition")
      const match = dispo?.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? `statement_${statementRange.fromIso.slice(0, 10)}_${statementRange.toIso.slice(0, 10)}.csv`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast({
        title: "Export started",
        description:
          exportFormat === "zip"
            ? "Statement ZIP (ledger.csv, executed_orders.csv, funds, positions, manifest.json) downloaded."
            : "Full statement CSV (ledger + trade register + funds + manifest row) downloaded.",
      })
      onOpenChange(false)
    } catch (e: unknown) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md lg:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export statements
          </DialogTitle>
          <DialogDescription>
            Download the full audit CSV (all ledger lines, executed orders, completed deposits/withdrawals in range,
            open-position snapshot). Filtered table preview: {transactions.length} row(s).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-base font-medium">Export format</Label>
            <RadioGroup value={format} onValueChange={setFormat}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="flex items-center gap-2 cursor-pointer">
                  <FileText className="w-4 h-4" />
                  CSV (full statement pack)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="zip" id="zip" />
                <Label htmlFor="zip" className="flex items-center gap-2 cursor-pointer">
                  <File className="w-4 h-4" />
                  ZIP (separate CSV + manifest.json)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label htmlFor="pdf" className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                  <File className="w-4 h-4" />
                  PDF (not available)
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleExport()} disabled={isExporting}>
            {isExporting ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
