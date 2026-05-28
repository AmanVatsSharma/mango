// "use client"

// import { useState, useMemo } from "react"
// import { TrendingUp, Wallet, FileText, Eye, Loader2, RefreshCcw, Wifi, WifiOff } from "lucide-react"
// import { useSession } from "next-auth/react"
// import { Button } from "@/components/ui/button"
// import { Card, CardContent } from "@/components/ui/card"
// import { toast } from "@/hooks/use-toast"
// import { usePortfolio, useUserWatchlist, useOrdersAndPositions } from "@/lib/hooks/use-trading-data"
// import { MarketDataProvider, useMarketData } from "@/lib/hooks/MarketDataProvider"
// import { useRealtimeOrders, useRealtimePositions, useRealtimeAccount } from "@/lib/hooks/use-realtime-trading"
// import { useRealtimeTest } from "@/lib/hooks/use-realtime-test"
// import { OrderManagement } from "@/components/order-management"
// import { PositionTracking } from "@/components/position-tracking"
// import { Account } from "@/components/Account"
// import { Watchlist } from "@/components/watchlist"
// import { OrderDialog } from "@/components/OrderDialog"

// export default function TradingDashboardWrapper() {
//   const { data: session } = useSession()
//   const userId = session?.user?.id as string | undefined

//   if (!userId) {
//     return (
//       <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50 dark:bg-gray-900">
//         <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white mb-4">
//           <TrendingUp className="h-4 w-4" />
//         </div>
//         <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Brand Name</h1>
//         <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Please wait to rock and trade..</p>
//         <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
//       </div>
//     )
//   }

//   return (
//     <MarketDataProvider userId={userId}>
//       <TradingDashboard userId={userId} session={session}/>
//     </MarketDataProvider>
//   )
// }

// function TradingDashboard({ userId, session }: { userId: string, session: any }) {
//   const [currentTab, setCurrentTab] = useState<"watchlist" | "orders" | "positions" | "account">("watchlist")
//   const [orderDialogOpen, setOrderDialogOpen] = useState(false)
//   const [selectedStockForOrder, setSelectedStockForOrder] = useState<any | null>(null)

//   const { portfolio, isLoading: isPortfolioLoading, mutate: refreshPortfolio } = usePortfolio(userId)
//   const { watchlist: watchlistData, isLoading: isWatchlistLoading, mutate: refetchWatchlist } = useUserWatchlist(userId)
//   const { orders: initialOrders, positions: initialPositions, isLoading: isOrdersPositionsLoading, isError: isOrdersPositionsError, mutate: refreshOrdersPositions } = useOrdersAndPositions(userId)
//   const { quotes, isLoading: isQuotesLoading } = useMarketData()

//   // Realtime test connection
//   const { isConnected: isRealtimeConnected, lastMessage } = useRealtimeTest()

//   // Realtime subscriptions
//   const realtimeOrders = useRealtimeOrders(tradingAccountId)
//   const realtimePositions = useRealtimePositions(tradingAccountId)
//   const realtimeAccount = useRealtimeAccount(tradingAccountId)

//   // Use Realtime data if available, fallback to initial data
//   const orders = realtimeOrders.length > 0 ? realtimeOrders : initialOrders
//   const positions = realtimePositions.length > 0 ? realtimePositions : initialPositions
//   const accountUnified = realtimeAccount ? { account: realtimeAccount } : portfolio

//   // Get trading account ID for Realtime subscriptions
//   const tradingAccountId = (portfolio as any)?.account?.id || (accountUnified as any)?.account?.id

//   // Debug: Log Realtime status
//   console.log('Realtime Status:', {
//     tradingAccountId,
//     isRealtimeConnected,
//     realtimeOrders: realtimeOrders.length,
//     realtimePositions: realtimePositions.length,
//     hasRealtimeAccount: !!realtimeAccount,
//     lastMessage
//   })

//   // Handle select stock
//   const handleSelectStock = (stock: any) => {
//     setSelectedStockForOrder(stock)
//     setOrderDialogOpen(true)
//   }

//   // Refresh all
//   const handleRefreshAllData = () => {
//     refreshPortfolio()
//     refetchWatchlist()
//     refreshOrdersPositions()
//     toast({ title: "Refreshed", description: "Trading data updated." })
//   }

//   // Total & Day’s MTM
//   const { totalPnL, dayPnL } = useMemo(() => {
//     if (!positions?.length) return { totalPnL: 0, dayPnL: 0 }
//     let total = 0, day = 0
//     positions.forEach((pos: any) => {
//       const q = quotes?.[pos.stock?.instrumentId]
//       const ltp = q?.last_trade_price ?? pos.averagePrice
//       const diff = (ltp - pos.averagePrice) * pos.quantity
//       total += diff
//       day += (ltp - (pos.prevClosePrice ?? pos.averagePrice)) * pos.quantity
//     })
//     return { totalPnL: total, dayPnL: day }
//   }, [positions, quotes])

//   // Index bar with % change
//   const renderIndex = (name: string, instrumentId: string) => {
//     const q = quotes?.[instrumentId]
//     if (isQuotesLoading || !q) return <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
//     const change = ((q.last_trade_price - q.prev_close_price) / q.prev_close_price) * 100
//     return (
//       <div className="text-center">
//         <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{name}</span>
//         <p className={`text-sm font-mono font-bold ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
//           ₹{q.last_trade_price.toFixed(2)} 
//           {/* ({change.toFixed(2)}%) */}
//         </p>
//       </div>
//     )
//   }

//   const anyLoading = isPortfolioLoading || isWatchlistLoading || isOrdersPositionsLoading || isQuotesLoading

//   const renderContent = () => {
//     if (anyLoading) {
//       return (
//         <div className="flex flex-col items-center justify-center p-8 text-gray-500">
//           <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
//           <p>Loading your trading data...</p>
//         </div>
//       )
//     }

//     switch (currentTab) {
//       case "watchlist":
//         return <Watchlist watchlist={watchlistData} quotes={quotes} onSelectStock={handleSelectStock} onUpdate={refetchWatchlist} />
//       case "orders":
//         return <OrderManagement orders={orders} onOrderUpdate={refreshOrdersPositions} />
//       case "positions":
//         return (
//           <div className="space-y-4 pb-20">
//             <div className="grid grid-cols-2 gap-4">
//               <Card><CardContent className="p-3">
//                 <p className="text-sm text-gray-600 dark:text-gray-400">Day’s MTM</p>
//                 <p className={`text-lg font-semibold ${dayPnL >= 0 ? "text-green-600" : "text-red-600"}`}>{dayPnL >= 0 ? "+" : ""}₹{dayPnL.toFixed(2)}</p>
//               </CardContent></Card>
//               <Card><CardContent className="p-3">
//                 <p className="text-sm text-gray-600 dark:text-gray-400">Total P&L</p>
//                 <p className={`text-lg font-semibold ${totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}>{totalPnL >= 0 ? "+" : ""}₹{totalPnL.toFixed(2)}</p>
//               </CardContent></Card>
//             </div>
//             <PositionTracking positions={positions} quotes={quotes} onPositionUpdate={refreshOrdersPositions} tradingAccountId={tradingAccountId} />
//           </div>
//         )
//       case "account":
//         return <Account portfolio={accountUnified} user={session?.user} onUpdate={handleRefreshAllData} />
//       default:
//         return null
//     }
//   }

//   return (
//     <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
//       <header className="bg-white dark:bg-gray-800 border-b sticky top-0 z-40 w-screen">
//         <div className="flex h-16 items-center justify-between px-4 max-w-4xl mx-auto">
//           <div className="flex items-center gap-3">
//             <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white">
//               <TrendingUp className="h-4 w-4" />
//             </div>
//             <h1 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">Brand Name</h1>
//           </div>
//           <div className="flex items-center gap-4">
//             {renderIndex("NIFTY 50", "NSE_EQ-26000")}
//             {renderIndex("BANK NIFTY", "NSE_EQ-26009")}
//             {/* Realtime connection indicator */}
//             <div className="flex items-center gap-1 text-xs">
//               {isRealtimeConnected ? (
//                 <Wifi className="h-3 w-3 text-green-500" />
//               ) : (
//                 <WifiOff className="h-3 w-3 text-gray-400" />
//               )}
//               <span className="text-gray-500">Live</span>
//             </div>
//             {/* <Button size="sm" variant="outline" onClick={handleRefreshAllData}>
//               <RefreshCcw className="h-4 w-4 mr-1" /> Refresh
//             </Button> */}
//           </div>
//         </div>
//       </header>

//       <main className="px-4 pt-4 max-w-4xl mx-auto">
//         {renderContent()}
//       </main>

//       <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t z-50">
//         <div className="grid grid-cols-4 gap-1 p-2 max-w-4xl mx-auto">
//             {[{ id: "watchlist", icon: Eye, label: "Watchlist" },
//               { id: "orders", icon: FileText, label: "Orders" },
//               { id: "positions", icon: TrendingUp, label: "Positions" },
//               { id: "account", icon: Wallet, label: "Account" },
//             ].map(({ id, icon: Icon, label }) => (
//               <Button
//                 key={id}
//                 onClick={() => setCurrentTab(id as any)}
//                 variant="ghost"
//                 className={`flex flex-col items-center justify-center gap-2 rounded-xl py-3 px-1 transition-all duration-150 shadow-sm ${currentTab === id ? "text-blue-700 bg-blue-50 font-semibold shadow-lg" : "text-gray-500 hover:text-blue-600"}`}
//                 style={{ minWidth: 0, minHeight: 0, borderRadius: 16 }}
//               >
//                 <Icon className="h-5 w-5 mt-1" style={{ minWidth: 28, minHeight: 28 }} />
//                 <span className="text-sm font-medium tracking-wide" style={{ letterSpacing: 0.2 }}>{label}</span>
//               </Button>
//             ))}
//         </div>
//       </div>

//       <OrderDialog
//         isOpen={orderDialogOpen}
//         onClose={() => { setOrderDialogOpen(false); setSelectedStockForOrder(null) }}
//         stock={selectedStockForOrder}
//         portfolio={accountUnified}
//         drawer // 👈 tells OrderDialog to render as bottom drawer
//         onOrderPlaced={() => {
//           refreshOrdersPositions(); refreshPortfolio()
//         }}
//       />
//     </div>
//   )
// }
