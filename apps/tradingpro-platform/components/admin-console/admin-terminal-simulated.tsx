/**
 * @file admin-terminal-simulated.tsx
 * @module admin-console
 * @description Mock “Quick console” terminal UI (demo commands) for Logs & Terminal.
 * @author StockTrade
 * @created 2026-03-25
 */

"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Terminal, Trash2 } from "lucide-react"

const INITIAL_LINES = ["Trading Admin Terminal v2.1.0", "Type 'help' for available commands", ""]

export function AdminTerminalSimulated() {
  const [terminalInput, setTerminalInput] = useState("")
  const [terminalOutput, setTerminalOutput] = useState<string[]>(INITIAL_LINES)
  const terminalRef = useRef<HTMLDivElement>(null)

  const handleTerminalCommand = (command: string) => {
    const cmd = command.trim().toLowerCase()
    setTerminalOutput((prev) => [...prev, `$ ${command}`])

    switch (cmd) {
      case "help":
        setTerminalOutput((prev) => [
          ...prev,
          "Available commands:",
          "  help          - Show this help message",
          "  clear         - Clear terminal",
          "  status        - Show system status",
          "  users         - List active users",
          "  logs [level]  - Show logs (error, warn, info, debug)",
          "  db stats      - Show database statistics",
          "  backup        - Initiate system backup",
          "",
        ])
        break
      case "clear":
        setTerminalOutput(INITIAL_LINES)
        break
      case "status":
        setTerminalOutput((prev) => [
          ...prev,
          "System Status:",
          "  Server: ONLINE",
          "  Database: CONNECTED",
          "  Active Users: 1,234",
          "  Memory Usage: 67%",
          "  CPU Usage: 23%",
          "",
        ])
        break
      case "users":
        setTerminalOutput((prev) => [
          ...prev,
          "Active Users (Last 5):",
          "  USR_001234 - Alex Chen (2 min ago)",
          "  USR_005678 - Sarah Johnson (5 min ago)",
          "  USR_009876 - Mike Rodriguez (8 min ago)",
          "  USR_004321 - Emma Wilson (12 min ago)",
          "  USR_007890 - David Kim (15 min ago)",
          "",
        ])
        break
      case "db stats":
        setTerminalOutput((prev) => [
          ...prev,
          "Database Statistics:",
          "  Total Queries: 45,230",
          "  Avg Response Time: 12ms",
          "  Active Connections: 23",
          "  Cache Hit Rate: 94.2%",
          "  Storage Used: 2.4GB",
          "",
        ])
        break
      case "backup":
        setTerminalOutput((prev) => [
          ...prev,
          "Initiating system backup...",
          "Backup started at " + new Date().toLocaleTimeString(),
          "Estimated completion: 2-3 minutes",
          "",
        ])
        break
      default:
        if (cmd.startsWith("logs")) {
          const level = cmd.split(" ")[1]
          setTerminalOutput((prev) => [
            ...prev,
            `Showing ${level || "all"} logs:`,
            "Use the Logs tab for detailed log viewing",
            "",
          ])
        } else {
          setTerminalOutput((prev) => [
            ...prev,
            `Command not found: ${command}`,
            "Type 'help' for available commands",
            "",
          ])
        }
    }
    setTerminalInput("")
  }

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [terminalOutput])

  return (
    <Card className="bg-card/50 border-border neon-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold text-primary flex items-center">
            <Terminal className="w-5 h-5 mr-2" />
            Quick console
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTerminalOutput(INITIAL_LINES)}
            className="border-primary/50 text-primary hover:bg-primary/10 bg-transparent"
            type="button"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-black/90 rounded-lg p-4 font-mono text-sm terminal-glow">
          <div
            ref={terminalRef}
            className="h-80 overflow-y-auto space-y-1 text-green-400 scrollbar-thin scrollbar-thumb-green-400/50"
          >
            {terminalOutput.map((line, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.1, delay: Math.min(index * 0.02, 0.4) }}
                className="whitespace-pre-wrap"
              >
                {line}
              </motion.div>
            ))}
          </div>
          <div className="flex items-center mt-2 border-t border-green-400/30 pt-2">
            <span className="text-green-400 mr-2">$</span>
            <Input
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleTerminalCommand(terminalInput)
                }
              }}
              className="bg-transparent border-none text-green-400 placeholder-green-400/50 focus:ring-0 focus:outline-none p-0"
              placeholder="Enter command..."
              aria-label="Simulated terminal input"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
