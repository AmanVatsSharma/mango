/**
 * @file admin-web-terminal.tsx
 * @module admin-console
 * @description Real xterm.js session connected to terminal-gateway via WebSocket + JWT.
 * @author StockTrade
 * @created 2026-03-25
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Terminal as XTerm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Plug, PlugZap, Terminal as TerminalIcon, Trash2 } from "lucide-react"

type ConnState = "idle" | "connecting" | "open" | "error"

function decodeB64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

export function AdminWebTerminal() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [state, setState] = useState<ConnState>("idle")
  const [error, setError] = useState<string | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)

  const disconnect = useCallback(() => {
    try {
      wsRef.current?.close()
    } catch {
      /* noop */
    }
    wsRef.current = null
    setState("idle")
  }, [])

  const connect = useCallback(async () => {
    setError(null)
    setState("connecting")
    disconnect()

    let res: Response
    try {
      res = await fetch("/api/admin/terminal/session", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
      })
    } catch {
      setError("Could not reach server")
      setState("error")
      return
    }

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      error?: string
      code?: string
      wsUrl?: string
      token?: string
    }

    if (!res.ok || !data.success || !data.wsUrl || !data.token) {
      setError(data.error || `Session failed (${res.status})`)
      setState("error")
      return
    }

    let ws: WebSocket
    try {
      ws = new WebSocket(data.wsUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid WebSocket URL")
      setState("error")
      return
    }

    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ t: "auth", token: data.token }))
    }

    ws.onmessage = (ev) => {
      const term = termRef.current
      if (!term) return
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "") as {
          t?: string
          d?: string
          sessionId?: string
        }
        if (msg.t === "ready") {
          setState("open")
          fitRef.current?.fit()
          const cols = term.cols
          const rows = term.rows
          ws.send(JSON.stringify({ t: "resize", cols, rows }))
          return
        }
        if (msg.t === "out" && typeof msg.d === "string") {
          term.write(decodeB64ToUint8(msg.d))
        }
      } catch {
        /* ignore malformed */
      }
    }

    ws.onerror = () => {
      setError("WebSocket error")
      setState("error")
    }

    ws.onclose = () => {
      wsRef.current = null
      setState((s) => (s === "connecting" ? "error" : "idle"))
    }
  }, [disconnect])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#4ade80",
        cursor: "#4ade80",
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    term.onData((payload) => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: "in", d: payload }))
      }
    })

    roRef.current = new ResizeObserver(() => {
      fit.fit()
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN && term.cols && term.rows) {
        ws.send(JSON.stringify({ t: "resize", cols: term.cols, rows: term.rows }))
      }
    })
    roRef.current.observe(el)

    return () => {
      roRef.current?.disconnect()
      roRef.current = null
      disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [disconnect])

  const clearScreen = () => {
    termRef.current?.clear()
  }

  return (
    <Card className="bg-card/50 border-border neon-border">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
            <TerminalIcon className="w-5 h-5" />
            Live shell
            {state === "open" && (
              <span className="text-xs font-normal text-green-400 border border-green-400/40 rounded px-2 py-0.5">
                connected
              </span>
            )}
            {state === "connecting" && (
              <span className="text-xs font-normal text-muted-foreground">connecting…</span>
            )}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {state !== "open" ? (
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => void connect()}
                disabled={state === "connecting"}
                className="gap-1"
              >
                <Plug className="w-4 h-4" />
                Connect
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={disconnect} className="gap-1">
                <PlugZap className="w-4 h-4" />
                Disconnect
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={clearScreen} className="gap-1">
              <Trash2 className="w-4 h-4" />
              Clear
            </Button>
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive pt-1">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="h-[22rem] w-full rounded-lg border border-green-400/20 bg-black/90 p-1 overflow-hidden"
          aria-label="Live terminal"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Full shell on the gateway host. Use only on trusted networks; sessions are audited when you connect.
        </p>
      </CardContent>
    </Card>
  )
}
