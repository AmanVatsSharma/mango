/**
 * @file position-edit-dialog.tsx
 * @module admin-console
 * @description Professional position editing dialog with cascading options and fund management
 * @author StockTrade
 * @created 2025-01-27
 */

"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Edit, 
  Save, 
  X, 
  Loader2, 
  AlertTriangle, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  FileText,
  ShoppingCart,
  RefreshCw
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import {
  normalizePositionEditFundImpactInput,
  normalizePositionEditOptionalFinite,
  normalizePositionEditOptionalNonNegative,
  normalizePositionEditRequiredNonNegative,
} from "@/components/admin-console/position-edit-number-utils"

interface PositionEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  position: {
    id: string
    symbol: string
    quantity: number
    averagePrice: number
    stopLoss?: number | null
    target?: number | null
    unrealizedPnL?: number
    dayPnL?: number
    clientId?: string
    userName?: string
  }
  onSaved?: () => void
}

interface RelatedOrder {
  id: string
  symbol: string
  quantity: number
  orderType: string
  orderSide: string
  price?: number | null
  filledQuantity: number
  averagePrice?: number | null
  status: string
  createdAt: string
}

interface RelatedTransaction {
  id: string
  type: "CREDIT" | "DEBIT"
  amount: number
  description?: string
  createdAt: string
}

export function PositionEditDialog({ open, onOpenChange, position, onSaved }: PositionEditDialogProps) {
  const [loading, setLoading] = useState(false)
  const [loadingRelated, setLoadingRelated] = useState(false)
  const [relatedOrders, setRelatedOrders] = useState<RelatedOrder[]>([])
  const [relatedTransactions, setRelatedTransactions] = useState<RelatedTransaction[]>([])
  
  // Form state
  const [formData, setFormData] = useState({
    quantity: String(position.quantity),
    averagePrice: String(position.averagePrice),
    stopLoss: position.stopLoss != null ? String(position.stopLoss) : "",
    target: position.target != null ? String(position.target) : "",
    symbol: position.symbol,
    unrealizedPnL: position.unrealizedPnL != null ? String(position.unrealizedPnL) : "",
    dayPnL: position.dayPnL != null ? String(position.dayPnL) : "",
  })

  // Cascading options
  const [cascadeToOrders, setCascadeToOrders] = useState(false)
  const [cascadeToTransactions, setCascadeToTransactions] = useState(false)
  const [manageFunds, setManageFunds] = useState(true)

  // Reset form when position changes
  useEffect(() => {
    if (open && position) {
      setFormData({
        quantity: String(position.quantity),
        averagePrice: String(position.averagePrice),
        stopLoss: position.stopLoss != null ? String(position.stopLoss) : "",
        target: position.target != null ? String(position.target) : "",
        symbol: position.symbol,
        unrealizedPnL: position.unrealizedPnL != null ? String(position.unrealizedPnL) : "",
        dayPnL: position.dayPnL != null ? String(position.dayPnL) : "",
      })
      setCascadeToOrders(false)
      setCascadeToTransactions(false)
      setManageFunds(true)
    }
  }, [open, position])

  // Fetch related data when dialog opens
  useEffect(() => {
    if (open && position.id) {
      fetchRelatedData()
    }
  }, [open, position.id])

  const fetchRelatedData = async () => {
    setLoadingRelated(true)
    try {
      const response = await fetch(`/api/admin/positions/${position.id}/related`)
      if (!response.ok) throw new Error("Failed to fetch related data")
      const data = await response.json()
      
      setRelatedOrders(data.orders || [])
      setRelatedTransactions(data.transactions || [])
      
      console.log("✅ [POSITION-EDIT-DIALOG] Related data loaded:", {
        orders: data.orders?.length || 0,
        transactions: data.transactions?.length || 0
      })
    } catch (error: any) {
      console.error("❌ [POSITION-EDIT-DIALOG] Failed to fetch related data:", error)
      toast({
        title: "Warning",
        description: "Could not load related orders/transactions",
        variant: "destructive"
      })
    } finally {
      setLoadingRelated(false)
    }
  }

  const handleSave = async () => {
    // Validate form
    const quantity = normalizePositionEditRequiredNonNegative(formData.quantity)
    const averagePrice = normalizePositionEditRequiredNonNegative(formData.averagePrice)
    
    if (quantity === null) {
      toast({
        title: "Validation Error",
        description: "Quantity must be a non-negative number",
        variant: "destructive"
      })
      return
    }

    if (averagePrice === null) {
      toast({
        title: "Validation Error",
        description: "Average price must be a non-negative number",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const updates: any = {}
      
      // Calculate changes for fund management
      const oldQuantity = position.quantity
      const oldAvgPrice = position.averagePrice
      const newQuantity = quantity
      const newAvgPrice = averagePrice
      
      const oldValue = oldQuantity * oldAvgPrice
      const newValue = newQuantity * newAvgPrice
      const valueDelta = newValue - oldValue

      if (formData.quantity !== String(position.quantity)) {
        updates.quantity = quantity
      }
      if (formData.averagePrice !== String(position.averagePrice)) {
        updates.averagePrice = averagePrice
      }
      if (formData.stopLoss !== (position.stopLoss != null ? String(position.stopLoss) : "")) {
        const normalizedStopLoss = normalizePositionEditOptionalNonNegative(formData.stopLoss)
        if (formData.stopLoss !== "" && normalizedStopLoss === null) {
          throw new Error("Stop loss must be a non-negative number or blank")
        }
        updates.stopLoss = formData.stopLoss === "" ? null : normalizedStopLoss
      }
      if (formData.target !== (position.target != null ? String(position.target) : "")) {
        const normalizedTarget = normalizePositionEditOptionalNonNegative(formData.target)
        if (formData.target !== "" && normalizedTarget === null) {
          throw new Error("Target must be a non-negative number or blank")
        }
        updates.target = formData.target === "" ? null : normalizedTarget
      }
      if (formData.symbol !== position.symbol) {
        updates.symbol = formData.symbol.trim().toUpperCase()
      }
      if (formData.unrealizedPnL !== (position.unrealizedPnL != null ? String(position.unrealizedPnL) : "")) {
        const normalizedUnrealizedPnl = normalizePositionEditOptionalFinite(formData.unrealizedPnL)
        if (formData.unrealizedPnL !== "" && normalizedUnrealizedPnl === undefined) {
          throw new Error("Unrealized P&L must be a valid number or blank")
        }
        updates.unrealizedPnL = normalizedUnrealizedPnl
      }
      if (formData.dayPnL !== (position.dayPnL != null ? String(position.dayPnL) : "")) {
        const normalizedDayPnl = normalizePositionEditOptionalFinite(formData.dayPnL)
        if (formData.dayPnL !== "" && normalizedDayPnl === undefined) {
          throw new Error("Day P&L must be a valid number or blank")
        }
        updates.dayPnL = normalizedDayPnl
      }

      const payload: any = {
        positionId: position.id,
        updates,
        options: {
          cascadeToOrders: cascadeToOrders,
          cascadeToTransactions: cascadeToTransactions,
          manageFunds: manageFunds,
          valueDelta: manageFunds ? valueDelta : 0
        }
      }

      console.log("💰 [POSITION-EDIT-DIALOG] Saving position with options:", payload.options)

      const response = await fetch("/api/admin/positions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Save failed" }))
        throw new Error(error.error || "Failed to save position")
      }

      const result = await response.json()
      
      console.log("✅ [POSITION-EDIT-DIALOG] Position saved successfully")
      
      toast({
        title: "Success",
        description: "Position updated successfully"
      })

      onSaved?.()
      onOpenChange(false)
    } catch (error: any) {
      console.error("❌ [POSITION-EDIT-DIALOG] Save failed:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to save position",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const hasChanges = () => {
    return (
      formData.quantity !== String(position.quantity) ||
      formData.averagePrice !== String(position.averagePrice) ||
      formData.stopLoss !== (position.stopLoss != null ? String(position.stopLoss) : "") ||
      formData.target !== (position.target != null ? String(position.target) : "") ||
      formData.symbol !== position.symbol ||
      formData.unrealizedPnL !== (position.unrealizedPnL != null ? String(position.unrealizedPnL) : "") ||
      formData.dayPnL !== (position.dayPnL != null ? String(position.dayPnL) : "")
    )
  }

  const calculateFundImpact = () => {
    const oldQuantity = position.quantity
    const oldAvgPrice = position.averagePrice
    const newQuantity = normalizePositionEditFundImpactInput(formData.quantity)
    const newAvgPrice = normalizePositionEditFundImpactInput(formData.averagePrice)
    
    const oldValue = oldQuantity * oldAvgPrice
    const newValue = newQuantity * newAvgPrice
    const delta = newValue - oldValue
    
    return {
      oldValue,
      newValue,
      delta,
      isIncrease: delta > 0
    }
  }

  const fundImpact = calculateFundImpact()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-4xl bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="text-lg sm:text-xl font-bold text-primary flex items-center gap-2">
            <Edit className="w-5 h-5" />
            Edit Position: {position.symbol}
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-muted-foreground">
            {position.clientId && (
              <span>Client: {position.clientId} {position.userName && `(${position.userName})`}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 sm:px-6">
          {/* Position Details Form */}
          <Card className="bg-muted/30 border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Position Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol *</Label>
                  <Input
                    id="symbol"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="averagePrice">Average Price *</Label>
                  <Input
                    id="averagePrice"
                    type="number"
                    step="0.01"
                    value={formData.averagePrice}
                    onChange={(e) => setFormData({ ...formData, averagePrice: e.target.value })}
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stopLoss">Stop Loss</Label>
                  <Input
                    id="stopLoss"
                    type="number"
                    step="0.01"
                    value={formData.stopLoss}
                    onChange={(e) => setFormData({ ...formData, stopLoss: e.target.value })}
                    placeholder="Optional"
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target">Target</Label>
                  <Input
                    id="target"
                    type="number"
                    step="0.01"
                    value={formData.target}
                    onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                    placeholder="Optional"
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unrealizedPnL">Unrealized P&L</Label>
                  <Input
                    id="unrealizedPnL"
                    type="number"
                    step="0.01"
                    value={formData.unrealizedPnL}
                    onChange={(e) => setFormData({ ...formData, unrealizedPnL: e.target.value })}
                    placeholder="Optional"
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dayPnL">Day P&L</Label>
                  <Input
                    id="dayPnL"
                    type="number"
                    step="0.01"
                    value={formData.dayPnL}
                    onChange={(e) => setFormData({ ...formData, dayPnL: e.target.value })}
                    placeholder="Optional"
                    className="bg-background border-border"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fund Impact Warning */}
          {hasChanges() && manageFunds && (fundImpact.delta !== 0) && (
            <Alert className={fundImpact.isIncrease ? "bg-green-500/10 border-green-500/50" : "bg-red-500/10 border-red-500/50"}>
              <DollarSign className="h-4 w-4" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Fund Impact:</span>
                  <span className={fundImpact.isIncrease ? "text-green-400" : "text-red-400"}>
                    {fundImpact.isIncrease ? "+" : ""}₹{Math.abs(fundImpact.delta).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs mt-1 text-muted-foreground">
                  Old Value: ₹{fundImpact.oldValue.toLocaleString()} → New Value: ₹{fundImpact.newValue.toLocaleString()}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Related Orders */}
          <Card className="bg-muted/30 border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Related Orders ({relatedOrders.length})
                </CardTitle>
                {loadingRelated && <Loader2 className="w-4 h-4 animate-spin" />}
              </div>
            </CardHeader>
            <CardContent>
              {relatedOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No related orders found</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {relatedOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-2 bg-background rounded border border-border">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge className={
                            order.status === 'EXECUTED' ? 'bg-green-400/20 text-green-400' :
                            order.status === 'CANCELLED' ? 'bg-red-400/20 text-red-400' :
                            'bg-yellow-400/20 text-yellow-400'
                          }>
                            {order.status}
                          </Badge>
                          <span className="font-mono text-sm">{order.symbol}</span>
                          <span className="text-xs text-muted-foreground">
                            {order.orderSide} {order.orderType}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Qty: {order.filledQuantity}/{order.quantity} @ {order.averagePrice || order.price || "N/A"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Related Transactions */}
          <Card className="bg-muted/30 border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Related Transactions ({relatedTransactions.length})
                </CardTitle>
                {loadingRelated && <Loader2 className="w-4 h-4 animate-spin" />}
              </div>
            </CardHeader>
            <CardContent>
              {relatedTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No related transactions found</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {relatedTransactions.map((txn) => (
                    <div key={txn.id} className="flex items-center justify-between p-2 bg-background rounded border border-border">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge className={
                            txn.type === 'CREDIT' ? 'bg-green-400/20 text-green-400' : 'bg-red-400/20 text-red-400'
                          }>
                            {txn.type}
                          </Badge>
                          <span className="text-sm">{txn.description || "No description"}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          ₹{Math.abs(txn.amount).toLocaleString()} • {new Date(txn.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cascading Options */}
          {(relatedOrders.length > 0 || relatedTransactions.length > 0) && hasChanges() && (
            <Card className="bg-yellow-500/10 border-yellow-500/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  Cascading Options
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This position has {relatedOrders.length} related order(s) and {relatedTransactions.length} related transaction(s).
                  Choose how to handle changes:
                </p>
                <div className="space-y-2">
                  {relatedOrders.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="cascadeOrders"
                        checked={cascadeToOrders}
                        onCheckedChange={(checked) => setCascadeToOrders(checked as boolean)}
                      />
                      <Label htmlFor="cascadeOrders" className="text-sm cursor-pointer">
                        Update related orders with new values (quantity, average price, symbol)
                      </Label>
                    </div>
                  )}
                  {relatedTransactions.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="cascadeTransactions"
                        checked={cascadeToTransactions}
                        onCheckedChange={(checked) => setCascadeToTransactions(checked as boolean)}
                      />
                      <Label htmlFor="cascadeTransactions" className="text-sm cursor-pointer">
                        Update related transactions with new amounts
                      </Label>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="manageFunds"
                      checked={manageFunds}
                      onCheckedChange={(checked) => setManageFunds(checked as boolean)}
                    />
                    <Label htmlFor="manageFunds" className="text-sm cursor-pointer">
                      Automatically adjust trading account funds based on position value changes
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="px-4 sm:px-6 pb-4 sm:pb-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !hasChanges()}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
