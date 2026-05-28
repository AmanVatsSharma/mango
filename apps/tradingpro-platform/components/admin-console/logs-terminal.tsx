/**
 * @file logs-terminal.tsx
 * @module admin-console
 * @description Logs & Terminal admin page: application logs, DB placeholder, Quick console + optional Live shell.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-25
 */

"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Terminal,
  Search,
  Download,
  Play,
  Pause,
  User,
  Database,
  Activity,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
} from "lucide-react"
import { PageHeader } from "./shared"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"
import { AdminTerminalSimulated } from "@/components/admin-console/admin-terminal-simulated"
import { AdminWebTerminal } from "@/components/admin-console/admin-web-terminal"

export function LogsTerminal() {
  const { permissions } = useAdminSession()
  const [logs, setLogs] = useState<any[]>([])
  const [databaseLogs, setDatabaseLogs] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [clientIdSearch, setClientIdSearch] = useState("")
  const [logLevel, setLogLevel] = useState("all")
  const [isLiveMode, setIsLiveMode] = useState(true)
  const [loading, setLoading] = useState(false)

  const wsPublicConfigured = Boolean(process.env.NEXT_PUBLIC_TERMINAL_WS_URL?.trim())
  const canLiveShell =
    wsPublicConfigured &&
    (permissions.includes("admin.terminal.shell") || permissions.includes("admin.all"))

  const fetchLogs = async () => {
    setLoading(true)

    try {
      const params = new URLSearchParams()
      if (logLevel !== 'all') params.set('level', logLevel)
      params.set('limit', '100')

      const response = await fetch(`/api/admin/logs?${params.toString()}`).catch(() => null)

      if (response && response.ok) {
        const data = await response.json()
        const formattedLogs = (data.logs || []).map((log: any) => ({
          id: log.id,
          timestamp: new Date(log.createdAt).toLocaleString('en-IN', { hour12: false }),
          level: log.level,
          source: log.category,
          userId: log.clientId || log.userId || null,
          message: log.message,
          details: log.details || log.metadata || {},
        }))
        setLogs(formattedLogs)
      } else {
        setLogs([])
      }
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    if (isLiveMode) {
      const interval = setInterval(fetchLogs, 10000) // Refresh every 10 seconds in live mode
      return () => clearInterval(interval)
    }
  }, [logLevel, isLiveMode])

  const getLogIcon = (level: string) => {
    switch (level) {
      case "ERROR":
        return <XCircle className="w-4 h-4 text-red-400" />
      case "WARN":
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />
      case "INFO":
        return <Info className="w-4 h-4 text-blue-400" />
      case "DEBUG":
        return <Activity className="w-4 h-4 text-purple-400" />
      default:
        return <CheckCircle className="w-4 h-4 text-green-400" />
    }
  }

  const getLogBadge = (level: string) => {
    const colors = {
      ERROR: "bg-red-400/20 text-red-400 border-red-400/30",
      WARN: "bg-yellow-400/20 text-yellow-400 border-yellow-400/30",
      INFO: "bg-blue-400/20 text-blue-400 border-blue-400/30",
      DEBUG: "bg-purple-400/20 text-purple-400 border-purple-400/30",
      SUCCESS: "bg-green-400/20 text-green-400 border-green-400/30",
    }
    return <Badge className={colors[level as keyof typeof colors] || colors.INFO}>{level}</Badge>
  }

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.source.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesClientId = !clientIdSearch || (log.userId && log.userId.includes(clientIdSearch))
    const matchesLevel = logLevel === "all" || log.level === logLevel
    return matchesSearch && matchesClientId && matchesLevel
  })

  // Simulate live logs
  useEffect(() => {
    if (!isLiveMode) return

    const interval = setInterval(() => {
      const newLog = {
        id: Date.now(),
        timestamp: new Date().toISOString().replace("T", " ").slice(0, 23),
        level: ["INFO", "WARN", "ERROR", "DEBUG"][Math.floor(Math.random() * 4)],
        source: ["AUTH_SERVICE", "PAYMENT_SERVICE", "TRADE_ENGINE", "API_GATEWAY"][Math.floor(Math.random() * 4)],
        userId: Math.random() > 0.3 ? `USR_${Math.random().toString().slice(2, 8)}` : null,
        message: [
          "User session created",
          "Trade executed successfully",
          "Payment processed",
          "API request received",
          "Database query completed",
        ][Math.floor(Math.random() * 5)],
        details: {},
      }
      // In a real app, this would update the logs array
    }, 3000)

    return () => clearInterval(interval)
  }, [isLiveMode])

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* Header */}
      <PageHeader
        title="Logs & Terminal"
        description="Monitor system logs and execute terminal commands"
        icon={<Terminal className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLiveMode(!isLiveMode)}
            className={`border-primary/50 text-xs sm:text-sm ${isLiveMode ? "text-green-400 bg-green-400/10" : "text-muted-foreground"}`}
          >
            {isLiveMode ? <Pause className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> : <Play className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />}
            {isLiveMode ? "Live" : "Paused"}
          </Button>
        }
      />

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Tabs defaultValue="logs" className="space-y-3 sm:space-y-4 md:space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-muted/30 text-xs sm:text-sm">
            <TabsTrigger
              value="logs"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm"
            >
              <span className="hidden sm:inline">Application Logs</span>
              <span className="sm:hidden">App</span>
            </TabsTrigger>
            <TabsTrigger
              value="database"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm"
            >
              <span className="hidden sm:inline">Database Logs</span>
              <span className="sm:hidden">DB</span>
            </TabsTrigger>
            <TabsTrigger
              value="terminal"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm"
            >
              Terminal
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logs">
            <div className="space-y-4">
              {/* Filters */}
              <Card className="bg-card/50 border-border neon-border">
                <CardContent className="p-3 sm:p-4 md:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="relative">
                      <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search logs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 sm:pl-10 bg-muted/50 border-border focus:border-primary text-sm"
                      />
                    </div>
                    <div className="relative">
                      <User className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Client ID..."
                        value={clientIdSearch}
                        onChange={(e) => setClientIdSearch(e.target.value)}
                        className="pl-8 sm:pl-10 bg-muted/50 border-border focus:border-primary text-sm"
                      />
                    </div>
                    <Select value={logLevel} onValueChange={setLogLevel}>
                      <SelectTrigger className="bg-muted/50 border-border focus:border-primary text-sm">
                        <SelectValue placeholder="Log Level" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="all">All Levels</SelectItem>
                        <SelectItem value="ERROR">Error</SelectItem>
                        <SelectItem value="WARN">Warning</SelectItem>
                        <SelectItem value="INFO">Info</SelectItem>
                        <SelectItem value="DEBUG">Debug</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-primary/50 text-primary hover:bg-primary/10 bg-transparent text-xs sm:text-sm"
                    >
                      <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Export</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Logs Display */}
              <Card className="bg-card/50 border-border neon-border">
                <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
                  <CardTitle className="text-lg sm:text-xl font-bold text-primary flex items-center">
                    <Activity className="w-5 h-5 mr-2" />
                    Application Logs ({filteredLogs.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  <div className="space-y-2 max-h-96 overflow-y-auto font-mono text-xs sm:text-sm">
                    <AnimatePresence>
                      {filteredLogs.map((log, index) => (
                        <motion.div
                          key={log.id}
                          className="flex items-start space-x-3 p-3 bg-muted/30 rounded-lg border border-border/50 hover:border-primary/30 transition-all duration-200"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.3, delay: index * 0.02 }}
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            {getLogIcon(log.level)}
                            {getLogBadge(log.level)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                              <div className="flex items-center space-x-2">
                                <Badge className="bg-muted text-muted-foreground text-xs">{log.source}</Badge>
                                {log.userId && (
                                  <Badge className="bg-primary/20 text-primary text-xs">{log.userId}</Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-foreground">{log.message}</p>
                            {Object.keys(log.details).length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-primary">
                                  Show details
                                </summary>
                                <pre className="text-xs text-muted-foreground mt-1 bg-muted/50 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="database">
            <Card className="bg-card/50 border-border neon-border">
              <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-lg sm:text-xl font-bold text-primary flex items-center">
                  <Database className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0" />
                  <span className="truncate">Database Query Logs</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="space-y-2 max-h-96 overflow-y-auto font-mono text-xs sm:text-sm">
                  {databaseLogs.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">
                      <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>Database query logging is not available</p>
                      <p className="text-xs mt-1">Query logs are not currently being captured</p>
                    </div>
                  ) : (
                    databaseLogs.map((log, index) => (
                      <motion.div
                        key={log.id}
                        className="p-3 bg-muted/30 rounded-lg border border-border/50"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                          <div className="flex items-center space-x-2">
                            {getLogBadge(log.status)}
                            <span className="text-xs text-muted-foreground">{log.duration}</span>
                            <span className="text-xs text-muted-foreground">{log.rows} rows</span>
                          </div>
                        </div>
                        <code className="text-primary text-xs bg-primary/10 p-2 rounded block overflow-x-auto">
                          {log.query}
                        </code>
                      </motion.div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="terminal" className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Terminal className="w-4 h-4 text-primary" />
              <span>
                {canLiveShell
                  ? "Quick console (demo) or Live shell (real PTY on gateway host)."
                  : "Quick console. Live shell requires NEXT_PUBLIC_TERMINAL_WS_URL and Super Admin terminal permission."}
              </span>
            </div>
            {canLiveShell ? (
              <Tabs defaultValue="quick" className="w-full space-y-4">
                <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted/30">
                  <TabsTrigger value="quick">Quick console</TabsTrigger>
                  <TabsTrigger value="live">Live shell</TabsTrigger>
                </TabsList>
                <TabsContent value="quick" className="mt-0">
                  <AdminTerminalSimulated />
                </TabsContent>
                <TabsContent value="live" className="mt-0">
                  <AdminWebTerminal />
                </TabsContent>
              </Tabs>
            ) : (
              <AdminTerminalSimulated />
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}
