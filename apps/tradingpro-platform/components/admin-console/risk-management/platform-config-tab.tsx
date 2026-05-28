/**
 * @file platform-config-tab.tsx
 * @module admin-console/risk-management
 * @description Platform-wide leverage, margin, and brokerage configuration by segment/product type
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Edit, Globe, Loader2, Plus } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { StatusBadge } from "@/components/admin-console/shared"
import { deriveRiskConfigInstrumentKind } from "@/lib/services/risk/risk-config-instrument-kind"
import {
  normalizeRiskConfigLeverageInput,
  normalizeRiskConfigNullableNonNegativeInput,
  normalizeRiskConfigNullableNonNegativeIntegerInput,
  riskConfigNullableNumberInputString,
} from "@/components/admin-console/risk-management-number-utils"
import type { RiskConfig } from "./risk-types"

const EMPTY_CONFIG = {
  segment: "",
  productType: "",
  leverage: 1,
  brokerageFlat: null as number | null,
  brokerageRate: null as number | null,
  brokerageCap: null as number | null,
  marginRate: null as number | null,
  minMarginPerLot: null as number | null,
  maxOrderValue: null as number | null,
  maxPositions: null as number | null,
  active: true,
}

interface PlatformConfigTabProps {
  refreshKey: number
}

export function PlatformConfigTab({ refreshKey }: PlatformConfigTabProps) {
  const [riskConfigs, setRiskConfigs] = useState<RiskConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState<RiskConfig | null>(null)
  const [newConfig, setNewConfig] = useState({ ...EMPTY_CONFIG })
  const [saving, setSaving] = useState(false)

  const [platformSegmentFilter, setPlatformSegmentFilter] = useState<string>("all")
  const [platformProductFilter, setPlatformProductFilter] = useState("")
  const [platformActiveFilter, setPlatformActiveFilter] = useState<"all" | "active" | "inactive">("all")
  const [platformFoOnlyFilter, setPlatformFoOnlyFilter] = useState(false)
  const [coverageSamples, setCoverageSamples] = useState<
    Array<{
      label: string
      segment: string
      productType: string
      optionType: string | null
      resolved: {
        id: string
        segment: string
        productType: string
        leverage: number
        marginRate: number | null
        minMarginPerLot: number | null
      } | null
    }>
  | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(false)

  const fetchConfigs = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/risk/config")
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? "Failed to load configs")
      }
      const data = await res.json()
      setRiskConfigs(data.configs ?? [])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load platform risk configs"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchConfigs()
  }, [refreshKey])

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      const url = selectedConfig ? `/api/admin/risk/config/${selectedConfig.id}` : "/api/admin/risk/config"
      const method = selectedConfig ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error((errData as { error?: string }).error ?? "Failed to save config")
      }
      toast({
        title: "Success",
        description: selectedConfig ? "Platform risk config updated" : "Platform risk config created",
      })
      setShowConfigDialog(false)
      setSelectedConfig(null)
      setNewConfig({ ...EMPTY_CONFIG })
      void fetchConfigs()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save config"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const loadCoveragePreview = async () => {
    setCoverageLoading(true)
    try {
      const res = await fetch("/api/admin/risk/coverage")
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Coverage request failed")
      setCoverageSamples(Array.isArray(data.samples) ? data.samples : [])
    } catch (error: unknown) {
      toast({
        title: "Coverage preview failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
      setCoverageSamples(null)
    } finally {
      setCoverageLoading(false)
    }
  }

  const filteredPlatformRiskConfigs = useMemo(() => {
    return riskConfigs.filter((c) => {
      const segLower = c.segment.toLowerCase()
      if (platformSegmentFilter !== "all") {
        if (platformSegmentFilter === "nse" && segLower !== "nse") return false
        if (platformSegmentFilter === "bse" && segLower !== "bse") return false
        if (
          platformSegmentFilter === "nfo_group" &&
          segLower !== "nfo" &&
          segLower !== "nse_fo" &&
          segLower !== "bse_fo"
        )
          return false
        if (platformSegmentFilter === "mcx" && segLower !== "mcx") return false
      }
      if (platformFoOnlyFilter) {
        if (!["nfo", "mcx", "nse_fo", "bse_fo"].includes(segLower)) return false
      }
      if (platformProductFilter.trim()) {
        const needle = platformProductFilter.trim().toLowerCase()
        if (!c.productType.toLowerCase().includes(needle)) return false
      }
      if (platformActiveFilter === "active" && !c.active) return false
      if (platformActiveFilter === "inactive" && c.active) return false
      return true
    })
  }, [riskConfigs, platformSegmentFilter, platformProductFilter, platformActiveFilter, platformFoOnlyFilter])

  const openEdit = (config: RiskConfig) => {
    setSelectedConfig(config)
    setNewConfig({
      segment: config.segment,
      productType: config.productType,
      leverage: config.leverage,
      brokerageFlat: config.brokerageFlat,
      brokerageRate: config.brokerageRate,
      brokerageCap: config.brokerageCap,
      marginRate: config.marginRate,
      minMarginPerLot: config.minMarginPerLot,
      maxOrderValue: config.maxOrderValue,
      maxPositions: config.maxPositions,
      active: config.active,
    })
    setShowConfigDialog(true)
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary">Platform-Wide Leverage Configuration</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Manage leverage, margin, and brokerage settings by segment and product type</p>
        </div>
        <Dialog open={showConfigDialog} onOpenChange={(open) => {
          setShowConfigDialog(open)
          if (!open) { setSelectedConfig(null); setNewConfig({ ...EMPTY_CONFIG }) }
        }}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Add Config
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-primary">
                {selectedConfig ? "Edit Platform Risk Config" : "Create Platform Risk Config"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                Configure leverage, margin rates, brokerage, and position limits for a segment/product type combination.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {/* Section 1: Identity */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Instrument</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Segment *</Label>
                    <Select value={newConfig.segment} onValueChange={(v) => setNewConfig({ ...newConfig, segment: v })}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Select segment" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Indian equity */}
                        <SelectItem value="NSE">NSE (Equity)</SelectItem>
                        <SelectItem value="BSE">BSE (Equity)</SelectItem>
                        {/* Indian equity F&O */}
                        <SelectItem value="NFO">NFO (NSE F&amp;O)</SelectItem>
                        <SelectItem value="BSE_FO">BSE_FO (BSE F&amp;O)</SelectItem>
                        {/* Indian commodity */}
                        <SelectItem value="MCX">MCX (Commodity)</SelectItem>
                        <SelectItem value="NCO_FO">NCO_FO (Commodity #2)</SelectItem>
                        {/* Indian currency derivatives */}
                        <SelectItem value="CDS_FO">CDS_FO (NSE Currency Deriv)</SelectItem>
                        <SelectItem value="BCD_FO">BCD_FO (BSE Currency Deriv)</SelectItem>
                        {/* Global / 24-7 */}
                        <SelectItem value="CRYPTO">CRYPTO (Binance)</SelectItem>
                        <SelectItem value="FX">FX (Forex Spot)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Product Type *</Label>
                    <Select value={newConfig.productType} onValueChange={(v) => setNewConfig({ ...newConfig, productType: v })}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Select product type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MIS">MIS (Intraday)</SelectItem>
                        <SelectItem value="CNC">CNC (Delivery)</SelectItem>
                        <SelectItem value="NRML">NRML (Carry Forward)</SelectItem>
                        <SelectItem value="NRML_FUT">NRML_FUT (F&amp;O futures)</SelectItem>
                        <SelectItem value="NRML_OPT">NRML_OPT (F&amp;O options — both sides)</SelectItem>
                        <SelectItem value="NRML_OPT_BUY">NRML_OPT_BUY (carry options — long)</SelectItem>
                        <SelectItem value="NRML_OPT_SELL">NRML_OPT_SELL (carry options — short)</SelectItem>
                        <SelectItem value="MIS_FUT">MIS_FUT (F&amp;O intraday futures)</SelectItem>
                        <SelectItem value="MIS_OPT">MIS_OPT (F&amp;O intraday options — both sides)</SelectItem>
                        <SelectItem value="MIS_OPT_BUY">MIS_OPT_BUY (intraday options — long)</SelectItem>
                        <SelectItem value="MIS_OPT_SELL">MIS_OPT_SELL (intraday options — short)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <Label className="text-sm">Active</Label>
                  <Switch checked={newConfig.active} onCheckedChange={(v) => setNewConfig({ ...newConfig, active: v })} />
                </div>
              </div>

              <Separator />

              {/* Section 2: Margin & Leverage */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Margin &amp; Leverage</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Leverage (Multiplier) *</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      value={newConfig.leverage}
                      onChange={(e) =>
                        setNewConfig({ ...newConfig, leverage: normalizeRiskConfigLeverageInput(e.target.value, newConfig.leverage) })
                      }
                      placeholder="e.g., 5 for 5x"
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Base leverage multiplier</p>
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Margin rate (optional)</Label>
                    <Input
                      type="number"
                      step="0.000001"
                      min="0"
                      value={riskConfigNullableNumberInputString(newConfig.marginRate)}
                      onChange={(e) =>
                        setNewConfig({ ...newConfig, marginRate: normalizeRiskConfigNullableNonNegativeInput(e.target.value) })
                      }
                      placeholder="e.g. 0.10 (=10%)"
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      If set (&gt;0), required margin = turnover × rate. Values &gt;1 treated as percent.
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <Label className="text-sm mb-1.5 block">Min margin per lot — option sell (₹, optional)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={riskConfigNullableNumberInputString(newConfig.minMarginPerLot)}
                    onChange={(e) =>
                      setNewConfig({ ...newConfig, minMarginPerLot: normalizeRiskConfigNullableNonNegativeInput(e.target.value) })
                    }
                    placeholder="e.g. 5000 — floor for CE/PE SELL only"
                    className="bg-background"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Short options (CE/PE + sell) use at least this amount × lots, even if premium × leverage would be lower.
                  </p>
                </div>
              </div>

              <Separator />

              {/* Section 3: Brokerage & Limits */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Brokerage &amp; Limits</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Brokerage Flat (₹)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={riskConfigNullableNumberInputString(newConfig.brokerageFlat)}
                      onChange={(e) =>
                        setNewConfig({ ...newConfig, brokerageFlat: normalizeRiskConfigNullableNonNegativeInput(e.target.value) })
                      }
                      placeholder="Optional flat"
                      className="bg-background"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Brokerage Rate (%)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={riskConfigNullableNumberInputString(newConfig.brokerageRate)}
                      onChange={(e) =>
                        setNewConfig({ ...newConfig, brokerageRate: normalizeRiskConfigNullableNonNegativeInput(e.target.value) })
                      }
                      placeholder="Optional % rate"
                      className="bg-background"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Brokerage Cap (₹)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={riskConfigNullableNumberInputString(newConfig.brokerageCap)}
                      onChange={(e) =>
                        setNewConfig({ ...newConfig, brokerageCap: normalizeRiskConfigNullableNonNegativeInput(e.target.value) })
                      }
                      placeholder="Optional max"
                      className="bg-background"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Max Order Value (₹)</Label>
                    <Input
                      type="number"
                      step="1000"
                      value={riskConfigNullableNumberInputString(newConfig.maxOrderValue)}
                      onChange={(e) =>
                        setNewConfig({ ...newConfig, maxOrderValue: normalizeRiskConfigNullableNonNegativeInput(e.target.value) })
                      }
                      placeholder="Optional limit"
                      className="bg-background"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Max Positions</Label>
                    <Input
                      type="number"
                      value={riskConfigNullableNumberInputString(newConfig.maxPositions)}
                      onChange={(e) =>
                        setNewConfig({ ...newConfig, maxPositions: normalizeRiskConfigNullableNonNegativeIntegerInput(e.target.value) })
                      }
                      placeholder="Optional limit"
                      className="bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void handleSaveConfig()} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {selectedConfig ? "Update Config" : "Create Config"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Alert className="border-primary/30 bg-primary/5">
        <Globe className="h-4 w-4" />
        <AlertTitle>F&amp;O futures vs options (watchlist parity)</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground space-y-1">
          <p>
            Use <code className="font-mono">NRML_FUT</code> / <code className="font-mono">NRML_OPT</code> for carry-forward split, and{" "}
            <code className="font-mono">MIS_FUT</code> / <code className="font-mono">MIS_OPT</code> for intraday split. Add{" "}
            <code className="font-mono">NRML_OPT_BUY</code> / <code className="font-mono">NRML_OPT_SELL</code> (and MIS equivalents) when long and short option margin must differ.
            Plain <code className="font-mono">NRML</code> or <code className="font-mono">MIS</code> applies to both legs until split rows exist.
            Margin rate: values &gt; 1 treated as percent of notional; 0–1 as fraction.
            Statutory charges: Orders / order charges config.
          </p>
        </AlertDescription>
      </Alert>

      {/* Filters */}
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col lg:flex-row lg:flex-wrap gap-3 items-stretch lg:items-end">
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs text-muted-foreground">Segment</Label>
              <Select value={platformSegmentFilter} onValueChange={setPlatformSegmentFilter}>
                <SelectTrigger className="bg-background border-border h-9">
                  <SelectValue placeholder="All segments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All segments</SelectItem>
                  <SelectItem value="nse">NSE (equity)</SelectItem>
                  <SelectItem value="bse">BSE (equity)</SelectItem>
                  <SelectItem value="nfo_group">NFO / NSE_FO / BSE_FO</SelectItem>
                  <SelectItem value="mcx">MCX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[120px]">
              <Label className="text-xs text-muted-foreground">Product contains</Label>
              <Input
                className="h-9 bg-background border-border"
                placeholder="e.g. NRML"
                value={platformProductFilter}
                onChange={(e) => setPlatformProductFilter(e.target.value)}
              />
            </div>
            <div className="space-y-1 min-w-[120px]">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={platformActiveFilter} onValueChange={(v) => setPlatformActiveFilter(v as "all" | "active" | "inactive")}>
                <SelectTrigger className="bg-background border-border h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Switch checked={platformFoOnlyFilter} onCheckedChange={setPlatformFoOnlyFilter} id="fo-only-filter" />
              <Label htmlFor="fo-only-filter" className="text-xs cursor-pointer">F&amp;O / MCX only</Label>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={coverageLoading}
              onClick={() => void loadCoveragePreview()}
            >
              {coverageLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Resolution preview
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Coverage preview */}
      {coverageSamples && coverageSamples.length > 0 && (
        <Card className="bg-muted/30 border-border">
          <CardHeader className="py-3 px-4 pb-2">
            <CardTitle className="text-sm font-medium">Sample resolution (active rows)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="overflow-x-auto text-xs font-mono space-y-1 max-h-48 overflow-y-auto">
              {coverageSamples.map((row, idx) => (
                <div key={idx} className="border-b border-border/50 py-1 flex items-center gap-2">
                  <span className="text-muted-foreground flex-1">{row.label}</span>
                  <span className="text-muted-foreground">→</span>
                  {row.resolved ? (
                    <span className="text-green-400">
                      {row.resolved.segment}/{row.resolved.productType} lev {row.resolved.leverage}
                      {row.resolved.marginRate != null ? ` m ${row.resolved.marginRate}` : ""}
                      {row.resolved.minMarginPerLot != null ? ` min₹/lot ${row.resolved.minMarginPerLot}` : ""}
                    </span>
                  ) : (
                    <span className="text-amber-500">no row (defaults apply)</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardHeader className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-primary">Platform Risk Configurations</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Kind is derived for operators; <span className="font-mono">F&amp;O shared</span> means plain NRML/MIS back both legs until split rows exist.
              </p>
            </div>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-3">
          <div className="overflow-x-auto">
            <div className="min-w-[1100px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Segment</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Product Type</TableHead>
                    <TableHead>Leverage</TableHead>
                    <TableHead>Margin rate</TableHead>
                    <TableHead>Min ₹/lot (short opt)</TableHead>
                    <TableHead>Brokerage</TableHead>
                    <TableHead>Max Order Value</TableHead>
                    <TableHead>Max Positions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskConfigs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                        No platform risk configs configured. Click &quot;Add Config&quot; to create the first one.
                      </TableCell>
                    </TableRow>
                  ) : filteredPlatformRiskConfigs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                        No rows match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPlatformRiskConfigs.map((config) => (
                      <TableRow key={config.id} className="border-border hover:bg-muted/20">
                        <TableCell className="font-medium text-foreground">{config.segment}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {deriveRiskConfigInstrumentKind(config.segment, config.productType)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{config.productType}</TableCell>
                        <TableCell>
                          <Badge className="bg-blue-400/20 text-blue-400 border-blue-400/30">{config.leverage}x</Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {config.marginRate != null ? String(config.marginRate) : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {config.minMarginPerLot != null ? `₹${config.minMarginPerLot}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {config.brokerageFlat != null ? (
                            <span>₹{config.brokerageFlat.toFixed(2)} flat</span>
                          ) : config.brokerageRate != null ? (
                            <span>{config.brokerageRate.toFixed(4)}%</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{config.maxOrderValue ? `₹${config.maxOrderValue.toLocaleString()}` : "—"}</TableCell>
                        <TableCell>{config.maxPositions ?? "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={config.active ? "active" : "inactive"} type="user" />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(config.updatedAt).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(config)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
