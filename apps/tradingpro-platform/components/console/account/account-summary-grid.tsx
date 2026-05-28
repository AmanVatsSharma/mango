"use client"

import { motion } from "framer-motion"
import { TrendingUp, TrendingDown, DollarSign, CreditCard, PieChart, Target } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { normalizeConsoleNumber } from "@/components/console/console-number-utils"

interface AccountSummaryGridProps {
  balanceVisible: boolean
  account?: {
    totalValue?: number
    availableMargin?: number
    usedMargin?: number
    balance?: number
  }
  unrealizedPnL?: number
}

export function AccountSummaryGrid({ balanceVisible, account, unrealizedPnL = 0 }: AccountSummaryGridProps) {
  // Dynamic values from props if provided; fallback to zeros
  const totalValue = normalizeConsoleNumber(account?.totalValue)
  const usedMargin = normalizeConsoleNumber(account?.usedMargin)
  const availableMargin = normalizeConsoleNumber(account?.availableMargin)
  const balance = normalizeConsoleNumber(account?.balance, totalValue)

  const accountData = [
    {
      title: "Total Balance",
      value: balance || totalValue || 0,
      change: 2.5,
      icon: DollarSign,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Used Margin",
      value: usedMargin,
      change: -1.2,
      icon: CreditCard,
      color: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-950",
    },
    {
      title: "Free Margin",
      value: availableMargin,
      change: 3.8,
      icon: Target,
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-950",
    },
    {
      title: "Credit Taken",
      value: 0,
      change: 0,
      icon: CreditCard,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-950",
    },
    {
      title: "Capital Assets",
      value: 0,
      change: 1.8,
      icon: PieChart,
      color: "text-purple-600",
      bgColor: "bg-purple-100 dark:bg-purple-950",
    },
    {
      title: "Unrealised P&L",
      value: unrealizedPnL,
      change: 15.6,
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-950",
      isProfit: true,
    },
  ]

  const formatCurrency = (value: number) => {
    if (!balanceVisible) return "••••••"
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatChange = (change: number) => {
    if (change === 0) return "0.00%"
    const sign = change > 0 ? "+" : ""
    return `${sign}${change.toFixed(2)}%`
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {accountData.map((item, index) => {
        const Icon = item.icon
        const isPositive = item.change > 0
        const isNegative = item.change < 0
        const isProfit = item.title === "Unrealised P&L" && item.value > 0

        return (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", item.bgColor)}>
                      <Icon className={cn("w-5 h-5", item.color)} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{item.title}</p>
                      <p
                        className={cn(
                          "text-2xl font-bold",
                          item.title === "Unrealised P&L"
                            ? item.value >= 0
                              ? "text-green-600"
                              : "text-red-600"
                            : "text-foreground",
                        )}
                      >
                        {formatCurrency(item.value)}
                      </p>
                    </div>
                  </div>
                  {item.change !== 0 && (
                    <div className="text-right">
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1",
                          isPositive
                            ? "border-green-200 text-green-700 bg-green-50 dark:border-green-800 dark:text-green-300 dark:bg-green-950"
                            : isNegative
                              ? "border-red-200 text-red-700 bg-red-50 dark:border-red-800 dark:text-red-300 dark:bg-red-950"
                              : "border-gray-200 text-gray-700 bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:bg-gray-950",
                        )}
                      >
                        {isPositive ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : isNegative ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : null}
                        {formatChange(item.change)}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )
      })}
    </div>
  )
}
