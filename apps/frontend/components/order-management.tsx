/**
 * @file order-management.tsx
 * @module components
 * @description Provides a responsive order-management workspace for viewing, filtering, modifying, and cancelling orders.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-01 — `instrumentLabel` from list API under symbol for F&O clarity.
 */
"use client"

import React, { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MoreHorizontal, Edit, Trash2, Loader2, FileText, ChevronDown, Activity } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { cancelOrder, modifyOrder, deleteOrder } from "@/lib/hooks/use-trading-data"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion"
import { formatOrderDateIST } from "@/lib/date-utils"
import { cn } from "@/lib/utils"
import { createClientLogger } from "@/lib/logging/client-logger"
import {
  type OrderTab,
  filterOrdersByTab,
  getOrderTabCounts,
  normalizeOrderManagementInputNumber,
  normalizeOrderManagementModifyPayload,
} from "@/components/order-management-number-utils"

const orderDebugLog = createClientLogger("order-management")

interface Order {
  id: string
  symbol: string
  instrumentLabel?: string
  quantity: number
  price: number | null
  orderType: string
  orderSide: string
  status: string
  createdAt: string
  filledQuantity?: number
  averagePrice?: number
  isOptimistic?: boolean
  failureReason?: string
  failureCode?: string | null
  productType?: string | null
  executedAt?: string | null
}

interface OrderManagementProps {
  orders: Order[]
  onOrderUpdate: () => void
}

function formatProductTypeLabel(productType: string | null | undefined): string | null {
  if (productType == null || !String(productType).trim()) return null
  const u = String(productType).trim().toUpperCase()
  if (u === "INTRADAY" || u === "MIS") return "MIS"
  if (u === "CNC" || u === "DELIVERY") return "CNC"
  if (u === "NRML") return "NRML"
  return u
}

function buildOrderFailureTooltip(order: Order): string {
  const parts: string[] = []
  if (order.failureCode) parts.push(`Code: ${order.failureCode}`)
  if (order.failureReason) parts.push(`Reason: ${order.failureReason}`)
  parts.push(`Order ID: ${order.id}`)
  return parts.join("\n")
}

function resolveOrderStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" | "success" {
  const normalizedStatus = String(status || "").toUpperCase()
  if (normalizedStatus === "EXECUTED") return "success"
  if (
    normalizedStatus === "PARTIALLY_FILLED" ||
    normalizedStatus === "PARTIAL_FILL" ||
    normalizedStatus === "PARTIAL FILL"
  ) {
    return "secondary"
  }
  if (normalizedStatus === "CANCELLED" || normalizedStatus === "REJECTED") return "destructive"
  return "outline"
}

function resolveFriendlyFailureReason(order: Order): string | null {
  const failureReason = typeof order.failureReason === "string" ? order.failureReason.trim() : ""
  const failureCode = typeof order.failureCode === "string" ? order.failureCode.trim().toUpperCase() : ""
  const searchable = `${failureCode} ${failureReason}`.toLowerCase()

  if (!failureReason && !failureCode) return null
  if (searchable.includes("stale quote")) {
    return "Quote was too old at execution time. Wait for a fresh tick and retry."
  }
  if (
    searchable.includes("no_live") ||
    searchable.includes("live quote unavailable") ||
    searchable.includes("no fresh server quote")
  ) {
    return "Live quote is unavailable for this instrument. Wait for live feed and retry."
  }
  if (searchable.includes("insufficient") && searchable.includes("margin")) {
    return "Insufficient margin. Add funds or reduce quantity."
  }
  if (searchable.includes("market") && searchable.includes("closed")) {
    return "Market session is closed for this instrument."
  }
  if (searchable.includes("exchange rejected")) {
    return "Exchange rejected this order. Review details and retry."
  }
  return failureReason || (failureCode ? `Order failed (${failureCode}).` : null)
}

type OrderCardVariant = "compact" | "relaxed"

interface OrderManagementListItemProps {
  order: Order
  variant: OrderCardVariant
  loading: string | null
  onOpenModify: (order: Order) => void
  onAction: (action: "modify" | "cancel" | "delete", orderId: string, payload?: Record<string, unknown>) => void
}

function OrderManagementListItem({
  order,
  variant,
  loading,
  onOpenModify,
  onAction,
}: OrderManagementListItemProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const x = useMotionValue(0)
  const opacity = useTransform(x, [-200, -80, 0], [0.8, 1, 1])
  const scale = useTransform(x, [-200, -80, 0], [0.95, 1, 1])

  const [detailsOpen, setDetailsOpen] = useState(false)
  const isCompact = variant === "compact"
  const productLabel = formatProductTypeLabel(order.productType)
  const isBuy = order.orderSide === "BUY"

  const submittedPrice =
    typeof order.price === "number" && Number.isFinite(order.price) ? order.price : null
  const executedPrice =
    typeof order.averagePrice === "number" && Number.isFinite(order.averagePrice) && order.averagePrice > 0
      ? order.averagePrice
      : null
  const normalizedStatus = String(order.status || "").toUpperCase()
  const statusLabel =
    normalizedStatus === "PENDING" && (order.filledQuantity || 0) > 0 ? "PARTIAL FILL" : normalizedStatus
  const friendlyFailureReason = resolveFriendlyFailureReason(order)
  const failureTooltip = buildOrderFailureTooltip(order)
  const isMarket = String(order.orderType || "").toUpperCase() === "MARKET"

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false)
    if (info.offset.x < -80) {
      setShowActions(true)
      x.set(-70)
    } else {
      setShowActions(false)
      x.set(0)
    }
  }

  const handleQuickCancel = async () => {
    await onAction("cancel", order.id)
    setShowActions(false)
    x.set(0)
  }

  return (
    <div className="relative overflow-hidden">
      {/* Swipe Action Background */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-y-0 right-0 flex items-center justify-center bg-gradient-to-l from-red-500 to-red-600 z-10 rounded-2xl w-20 shadow-lg"
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={handleQuickCancel}
              className="h-full w-full p-0 text-white hover:bg-red-700 rounded-2xl"
              disabled={loading === order.id}
            >
              {loading === order.id ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Trash2 className="h-6 w-6" />
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        drag={order.status === "PENDING" ? "x" : false}
        dragConstraints={{ left: -70, right: 0 }}
        dragElastic={0.1}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        style={{ x, opacity, scale }}
        className="relative z-20 bg-card rounded-2xl"
      >
        <Card
          className={cn(
            "group relative overflow-hidden transition-all duration-100",
            "bg-card/60 border border-border/30",
            "hover:bg-card hover:border-border/70 hover:shadow-[0_2px_12px_rgba(0,0,0,0.12)]",
            isCompact ? "rounded-xl" : "rounded-2xl",
            isDragging && "shadow-xl scale-[1.01]",
          )}
        >
          {/* Side Accent Stripe */}
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-2 bottom-2 w-[3px] rounded-full opacity-90",
              isBuy ? "bg-green-500" : "bg-red-500"
            )}
          />

          <CardContent className={cn("flex items-center gap-3", isCompact ? "p-3 sm:p-3.5" : "p-4 sm:p-5")}>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className={cn(
                        "font-bold text-foreground truncate uppercase tracking-tight",
                        isCompact ? "text-[15px]" : "text-base"
                      )}
                    >
                      {order.symbol}
                    </h3>
                    <Badge 
                      variant={isBuy ? "success" : "destructive"} 
                      className="text-[9px] px-1.5 h-4.5 font-bold tracking-widest uppercase border-0"
                    >
                      {order.orderSide}
                    </Badge>
                  </div>
                  {order.instrumentLabel && order.instrumentLabel !== order.symbol ? (
                    <p className="text-muted-foreground text-[10px] leading-tight font-medium opacity-80 mt-0.5 truncate">
                      {order.instrumentLabel}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {order.status === "PENDING" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                      onClick={() => onOpenModify(order)}
                      disabled={loading === order.id}
                    >
                      {loading === order.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Edit className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 rounded-full hover:bg-muted"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl shadow-lg border-border/40">
                      {order.status === "PENDING" ? (
                        <>
                          <DropdownMenuItem onClick={() => onOpenModify(order)} className="rounded-lg">
                            <Edit className="mr-2 h-4 w-4" />
                            Modify
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onAction("cancel", order.id)} className="text-destructive focus:text-destructive rounded-lg">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Cancel
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem onClick={() => onAction("delete", order.id)} className="text-destructive focus:text-destructive rounded-lg">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[9px] px-1.5 h-4.5 font-bold tracking-wider opacity-70">
                  {order.orderType}
                </Badge>
                {productLabel && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 h-4.5 font-bold tracking-wider bg-muted/50 border-0">
                    {productLabel}
                  </Badge>
                )}
                <Badge 
                  variant={resolveOrderStatusVariant(statusLabel)} 
                  className="text-[9px] px-1.5 h-4.5 font-bold tracking-wider uppercase border-0"
                >
                  {statusLabel}
                  {order.isOptimistic && order.status === "PENDING" && (
                    <Loader2 className="ml-1 h-3 w-3 animate-spin inline" />
                  )}
                </Badge>
                {order.isOptimistic && (
                  <Badge variant="outline" className="text-[9px] px-1.5 h-4.5 font-bold tracking-wider bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300">
                    Syncing…
                  </Badge>
                )}
              </div>

              <div
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground font-medium",
                  isCompact ? "text-[11px]" : "text-[12px]"
                )}
              >
                <div className="flex items-center gap-1">
                  <span className="opacity-60 text-[9px] uppercase tracking-widest">Qty</span>
                  <span className="text-foreground font-mono tabular-nums">
                    {order.filledQuantity ?? 0}/{order.quantity}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="opacity-60 text-[9px] uppercase tracking-widest">Price</span>
                  {isMarket ? (
                    <span className="text-foreground font-bold">MKT</span>
                  ) : submittedPrice !== null ? (
                    <span className="text-foreground font-mono tabular-nums tracking-tighter">₹{submittedPrice.toFixed(2)}</span>
                  ) : (
                    <span className="text-foreground">—</span>
                  )}
                </div>
                {executedPrice !== null && (
                  <div className="flex items-center gap-1">
                    <span className="opacity-60 text-[9px] uppercase tracking-widest">Avg</span>
                    <span className="text-green-600 font-mono tabular-nums tracking-tighter font-bold">₹{executedPrice.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {friendlyFailureReason && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-destructive cursor-help">
                      <Activity className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-[11px] font-semibold leading-tight">{friendlyFailureReason}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm whitespace-pre-wrap text-xs text-left bg-destructive text-white border-0 rounded-xl p-3 shadow-xl">
                    {failureTooltip}
                  </TooltipContent>
                </Tooltip>
              )}

              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 -ml-1 gap-1 text-[10px] font-bold uppercase tracking-widest"
                  >
                    <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", detailsOpen && "rotate-180")} />
                    Details
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1.5 rounded-xl border border-border/40 bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground/90 overflow-hidden">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-foreground/70 uppercase tracking-tighter text-[9px]">Order ID</span>
                    <span className="font-mono text-foreground font-medium">{order.id}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-foreground/70 uppercase tracking-tighter text-[9px]">Placed</span>
                    <span className="text-foreground font-medium">{formatOrderDateIST(order.createdAt)}</span>
                  </div>
                  {order.executedAt && (
                    <div className="flex justify-between items-center border-t border-border/20 pt-1.5 mt-1.5">
                      <span className="font-semibold text-foreground/70 uppercase tracking-tighter text-[9px]">Executed</span>
                      <span className="text-foreground font-medium">{formatOrderDateIST(order.executedAt)}</span>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

function OrderManagementInner({ orders, onOrderUpdate }: OrderManagementProps) {
  const [modifyDialogOpen, setModifyDialogOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [modifyPrice, setModifyPrice] = useState(0)
  const [modifyQuantity, setModifyQuantity] = useState(0)
  const [loading, setLoading] = useState<string | null>(null)
  const [currentOrderTab, setCurrentOrderTab] = useState<OrderTab>("all")

  const compactLayoutForOrder = (order: Order) =>
    order.status === "PENDING" && (currentOrderTab === "pending" || currentOrderTab === "all")

  const handleOrderTabChange = (value: string) => {
    if (value === "all" || value === "pending" || value === "executed" || value === "cancelled") {
      setCurrentOrderTab(value)
    }
  }

  const handleAction = async (
    action: "modify" | "cancel" | "delete",
    orderId: string,
    payload?: Record<string, unknown>
  ) => {
    setLoading(orderId)
    let shouldCloseDialog = true
    try {
      if (action === "modify") {
        const normalizedPayload = normalizeOrderManagementModifyPayload(payload || {})
        if (!normalizedPayload) {
          shouldCloseDialog = false
          toast({
            title: "Invalid modify input",
            description: "Provide a valid positive quantity or price.",
            variant: "destructive",
          })
          return
        }
        await modifyOrder(orderId, normalizedPayload)
        toast({ title: "Order Modified", description: "Your order has been updated." })
      } else if (action === "cancel") {
        await cancelOrder(orderId)
        toast({ title: "Order Cancelled", description: "Your order has been cancelled." })
      } else if (action === "delete") {
        await deleteOrder(orderId)
        toast({ title: "Order Deleted", description: "Your order has been deleted." })
      }
      onOrderUpdate()
    } catch (error) {
      orderDebugLog.error("Order action failed", action, orderId, error)
      toast({ title: `Failed to ${action} order`, description: "Something went wrong.", variant: "destructive" })
    } finally {
      setLoading(null)
      if (shouldCloseDialog) {
        setModifyDialogOpen(false)
      }
    }
  }

  const handleOpenModifyDialog = (order: Order) => {
    setSelectedOrder(order)
    setModifyPrice(normalizeOrderManagementInputNumber(String(order.price ?? 0)))
    setModifyQuantity(normalizeOrderManagementInputNumber(String(order.quantity)))
    setModifyDialogOpen(true)
  }

  const filteredOrders = useMemo(() => filterOrdersByTab(orders, currentOrderTab), [orders, currentOrderTab])

  const tabCounts = useMemo(() => getOrderTabCounts(orders), [orders])

  const activeTabLabel = useMemo(() => {
    if (currentOrderTab === "all") return "All"
    if (currentOrderTab === "pending") return "Pending"
    if (currentOrderTab === "executed") return "Executed"
    return "Cancelled"
  }, [currentOrderTab])

  const activeTabSequence = useMemo(() => {
    const orderTabs: OrderTab[] = ["all", "pending", "executed", "cancelled"]
    const index = orderTabs.indexOf(currentOrderTab)
    const normalizedIndex = index >= 0 ? index + 1 : 1
    return `${normalizedIndex}/${orderTabs.length}`
  }, [currentOrderTab])

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      <div className="flex items-center gap-2">
        <FileText className="h-7 w-7 text-primary" />
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Orders</h2>
      </div>

      <div className="desktop-sticky-rail rounded-2xl border border-border/60 bg-background/90 p-2 backdrop-blur-md shadow-sm">
        <Tabs value={currentOrderTab} onValueChange={handleOrderTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-4 rounded-2xl bg-muted p-1">
            <TabsTrigger value="all" className="rounded-xl data-[state=active]:bg-card gap-1.5">
              <span>All</span>
              <span className="text-[11px] text-muted-foreground/80">{tabCounts.all}</span>
            </TabsTrigger>
            <TabsTrigger value="pending" className="rounded-xl data-[state=active]:bg-card gap-1.5">
              <span>Pending</span>
              <span className="text-[11px] text-muted-foreground/80">{tabCounts.pending}</span>
            </TabsTrigger>
            <TabsTrigger value="executed" className="rounded-xl data-[state=active]:bg-card gap-1.5">
              <span>Executed</span>
              <span className="text-[11px] text-muted-foreground/80">{tabCounts.executed}</span>
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="rounded-xl data-[state=active]:bg-card gap-1.5">
              <span>Cancelled</span>
              <span className="text-[11px] text-muted-foreground/80">{tabCounts.cancelled}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-2 flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>
            Showing <span className="font-semibold text-foreground">{filteredOrders.length}</span> orders
          </span>
          <span className="text-right">
            View: <span className="font-semibold text-foreground">{activeTabLabel}</span>
            <span className="ml-1 text-muted-foreground/80">({activeTabSequence})</span>
          </span>
        </div>
      </div>

      <div className={cn("grid", currentOrderTab === "pending" || currentOrderTab === "all" ? "gap-2" : "gap-3")}>
        <AnimatePresence>
          {filteredOrders.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="rounded-xl shadow-sm border border-border p-6 text-center text-muted-foreground">
                <p>No {currentOrderTab} orders found.</p>
              </Card>
            </motion.div>
          ) : (
            filteredOrders.map((order) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <OrderManagementListItem
                  order={order}
                  variant={compactLayoutForOrder(order) ? "compact" : "relaxed"}
                  loading={loading}
                  onOpenModify={handleOpenModifyDialog}
                  onAction={handleAction}
                />
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      <Dialog open={modifyDialogOpen} onOpenChange={setModifyDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <Edit className="h-5 w-5 text-blue-600" />
              Modify Order
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">{selectedOrder.symbol}</h3>
                {selectedOrder.instrumentLabel &&
                selectedOrder.instrumentLabel !== selectedOrder.symbol ? (
                  <p className="text-xs text-gray-600 dark:text-gray-400 wrap-break-word mt-0.5">
                    {selectedOrder.instrumentLabel}
                  </p>
                ) : null}
                <div className="flex gap-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
                  <span>{selectedOrder.orderSide}</span>
                  <span>{selectedOrder.orderType}</span>
                  <span>
                    Current: {selectedOrder.quantity} @ ₹{selectedOrder.price}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={modifyQuantity}
                    onChange={(e) => setModifyQuantity(normalizeOrderManagementInputNumber(e.target.value))}
                    min="1"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Price</Label>
                  <Input
                    type="number"
                    value={modifyPrice}
                    onChange={(e) => setModifyPrice(normalizeOrderManagementInputNumber(e.target.value))}
                    step="0.05"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    handleAction("modify", selectedOrder.id, { price: modifyPrice, quantity: modifyQuantity })
                  }
                  disabled={loading === selectedOrder.id}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading === selectedOrder.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Modify Order"}
                </Button>
                <Button variant="outline" onClick={() => setModifyDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export const OrderManagement = React.memo(OrderManagementInner)
