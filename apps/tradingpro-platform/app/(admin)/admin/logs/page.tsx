/**
 * @file logs/page.tsx
 * @description Admin page for viewing trading logs by client ID
 */

"use client"

import { useState, useEffect } from "react"
import { formatTimestampIST } from "@/lib/date-utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Filter, Download, RefreshCw } from "lucide-react"
import { getLogsByClient } from "@/lib/logger"

interface LogEntry {
  id: string
  level: string
  category: string
  action: string
  message: string
  details: any
  metadata: any
  error: string | null
  createdAt: string
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [clientId, setClientId] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("ALL")
  const [selectedLevel, setSelectedLevel] = useState("ALL")
  const [searchTerm, setSearchTerm] = useState("")

  const fetchLogs = async () => {
    if (!clientId.trim()) return
    
    setLoading(true)
    try {
      const logsData = await getLogsByClient(clientId, 200, 0)
      setLogs(logsData)
    } catch (error) {
      console.error("Failed to fetch logs:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredLogs = logs.filter(log => {
    const matchesCategory = selectedCategory === "ALL" || log.category === selectedCategory
    const matchesLevel = selectedLevel === "ALL" || log.level === selectedLevel
    const matchesSearch = searchTerm === "" || 
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase())
    
    return matchesCategory && matchesLevel && matchesSearch
  })

  const exportLogs = () => {
    const csvContent = [
      "Timestamp,Level,Category,Action,Message,Error",
      ...filteredLogs.map(log =>
        `"${new Date(log.createdAt).toLocaleString()}","${log.level}","${log.category}","${log.action}","${log.message.replace(/"/g, '""')}","${log.error || ''}"`
      )
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `trading-logs-${clientId}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case "ERROR": return "bg-red-100 text-red-800"
      case "WARN": return "bg-yellow-100 text-yellow-800"
      case "INFO": return "bg-blue-100 text-blue-800"
      case "DEBUG": return "bg-gray-100 text-gray-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "ORDER": return "bg-green-100 text-green-800"
      case "POSITION": return "bg-purple-100 text-purple-800"
      case "TRANSACTION": return "bg-orange-100 text-orange-800"
      case "FUNDS": return "bg-cyan-100 text-cyan-800"
      case "AUTH": return "bg-pink-100 text-pink-800"
      case "SYSTEM": return "bg-indigo-100 text-indigo-800"
      case "API": return "bg-teal-100 text-teal-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Trading Logs</h1>
        <div className="flex items-center gap-2">
          <Button onClick={fetchLogs} disabled={loading || !clientId.trim()}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={exportLogs} variant="outline" disabled={filteredLogs.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Client ID</label>
              <Input
                placeholder="Enter client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Category</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Categories</SelectItem>
                  <SelectItem value="ORDER">Orders</SelectItem>
                  <SelectItem value="POSITION">Positions</SelectItem>
                  <SelectItem value="TRANSACTION">Transactions</SelectItem>
                  <SelectItem value="FUNDS">Funds</SelectItem>
                  <SelectItem value="AUTH">Authentication</SelectItem>
                  <SelectItem value="SYSTEM">System</SelectItem>
                  <SelectItem value="API">API Calls</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Level</label>
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Levels</SelectItem>
                  <SelectItem value="ERROR">Errors</SelectItem>
                  <SelectItem value="WARN">Warnings</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                  <SelectItem value="DEBUG">Debug</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Display */}
      <Card>
        <CardHeader>
          <CardTitle>
            Logs ({filteredLogs.length} of {logs.length})
            {clientId && <span className="text-sm font-normal text-gray-600 ml-2">for Client: {clientId}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {clientId ? "No logs found for this client" : "Enter a client ID to view logs"}
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {filteredLogs.map((log) => (
                <div key={log.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={getLevelColor(log.level)}>
                        {log.level}
                      </Badge>
                      <Badge className={getCategoryColor(log.category)}>
                        {log.category}
                      </Badge>
                      <span className="text-sm font-medium">{log.action}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {formatTimestampIST(log.createdAt)}
                    </span>
                  </div>
                  
                  <p className="text-sm">{log.message}</p>
                  
                  {log.error && (
                    <div className="bg-red-50 border border-red-200 rounded p-2">
                      <p className="text-sm text-red-800 font-medium">Error:</p>
                      <p className="text-sm text-red-700">{log.error}</p>
                    </div>
                  )}
                  
                  {log.details && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                        View Details
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
