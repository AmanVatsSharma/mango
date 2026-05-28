"use client"

import { useState, useEffect } from "react"
import { Calendar, Filter, X, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { format } from "date-fns"
import type { Transaction } from "./statements-section"

interface FilterBarProps {
  transactions: Transaction[]
  onFilterChange: (filtered: Transaction[]) => void
  totalTransactions: number
  filteredCount: number
}

export function FilterBar({ transactions, onFilterChange, totalTransactions, filteredCount }: FilterBarProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFrom, setDateFrom] = useState<Date>()
  const [dateTo, setDateTo] = useState<Date>()
  const [transactionType, setTransactionType] = useState<string>("all")
  const [category, setCategory] = useState<string>("all")
  const [isSticky, setIsSticky] = useState(false)

  // Handle sticky behavior
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      setIsSticky(scrollTop > 200)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Apply filters
  useEffect(() => {
    let filtered = [...transactions]

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (transaction) =>
          transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          transaction.id.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    // Date range filter
    if (dateFrom) {
      filtered = filtered.filter((transaction) => new Date(transaction.date) >= dateFrom)
    }
    if (dateTo) {
      filtered = filtered.filter((transaction) => new Date(transaction.date) <= dateTo)
    }

    // Transaction type filter
    if (transactionType !== "all") {
      filtered = filtered.filter((transaction) => transaction.type === transactionType)
    }

    // Category filter
    if (category !== "all") {
      filtered = filtered.filter((transaction) => transaction.category === category)
    }

    onFilterChange(filtered)
  }, [searchTerm, dateFrom, dateTo, transactionType, category, transactions, onFilterChange])

  const clearFilters = () => {
    setSearchTerm("")
    setDateFrom(undefined)
    setDateTo(undefined)
    setTransactionType("all")
    setCategory("all")
  }

  const hasActiveFilters = searchTerm || dateFrom || dateTo || transactionType !== "all" || category !== "all"

  return (
    <div className={`bg-card border-b transition-all duration-200 ${isSticky ? "sticky top-0 z-10 shadow-md" : ""}`}>
      <div className="p-4 space-y-4">
        {/* Search and Quick Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2 bg-transparent">
              <Filter className="w-4 h-4" />
              Filters
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="gap-2 bg-transparent">
                <X className="w-4 h-4" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date From */}
          <div className="space-y-2">
            <Label>From Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent">
                  <Calendar className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          {/* Date To */}
          <div className="space-y-2">
            <Label>To Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent">
                  <Calendar className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          {/* Transaction Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={transactionType} onValueChange={setTransactionType}>
              <SelectTrigger className="bg-transparent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="debit">Debit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-transparent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="trading">Trading</SelectItem>
                <SelectItem value="deposit">Deposit</SelectItem>
                <SelectItem value="withdrawal">Withdrawal</SelectItem>
                <SelectItem value="brokerage">Brokerage</SelectItem>
                <SelectItem value="charges">Charges</SelectItem>
                <SelectItem value="margin">Margin mechanics</SelectItem>
                <SelectItem value="reversal">Reversals / refunds</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filter Summary */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              Showing {filteredCount} of {totalTransactions} transactions
            </span>
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs">
                Filtered
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
