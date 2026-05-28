/**
 * @file index.ts
 * @module terminal-gateway
 * @description WebSocket server bridging browser clients to a local PTY (node-pty).
 * @author StockTrade
 * @created 2026-03-25
 *
 * Notes:
 * - Authenticate with first JSON frame { t:"auth", token } signed by Next (HS256).
 * - Logs use IST timestamps; never log keystrokes or PTY payload.
 */

import { createServer } from "node:http"
import jwt from "jsonwebtoken"
import * as pty from "node-pty"
import { WebSocketServer } from "ws"

const ist = () =>
  new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })

type AuthPayload = jwt.JwtPayload & {
  sub?: string
  role?: string
  sid?: string
  typ?: string
}

const SECRET = process.env.TERMINAL_GATEWAY_JWT_SECRET || ""
const HOST = process.env.TERMINAL_GATEWAY_HOST || "127.0.0.1"
const PORT = parseInt(process.env.TERMINAL_GATEWAY_PORT || "3001", 10)
const PATH = process.env.TERMINAL_GATEWAY_PATH || "/ws"
const SHELL = process.env.TERMINAL_SHELL || process.env.SHELL || "/bin/bash"
const CWD = process.env.TERMINAL_CWD || process.env.HOME || "/"
const MAX_MS = parseInt(process.env.TERMINAL_SESSION_MAX_MS || String(60 * 60 * 1000), 10)
const IDLE_MS = parseInt(process.env.TERMINAL_SESSION_IDLE_MS || String(15 * 60 * 1000), 10)
const MAX_ROWS = Math.min(parseInt(process.env.TERMINAL_MAX_ROWS || "200", 10), 500)
const MAX_COLS = Math.min(parseInt(process.env.TERMINAL_MAX_COLS || "400", 10), 512)

function allowEnv(): Record<string, string> {
  const pick = ["HOME", "USER", "PATH", "LANG", "LC_ALL", "TERM", "NODE_ENV"] as const
  const out: Record<string, string> = {
    TERM: "xterm-256color",
    NODE_ENV: process.env.NODE_ENV || "production",
  }
  for (const k of pick) {
    if (k === "TERM" || k === "NODE_ENV") continue
    const v = process.env[k]
    if (v) out[k] = v
  }
  return out
}

function logInfo(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", timeIst: ist(), msg, ...extra }))
}

function logWarn(msg: string, extra?: Record<string, unknown>) {
  console.warn(JSON.stringify({ level: "warn", timeIst: ist(), msg, ...extra }))
}

function logError(msg: string, extra?: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "error", timeIst: ist(), msg, ...extra }))
}

if (!SECRET || SECRET.length < 16) {
  logError("TERMINAL_GATEWAY_JWT_SECRET must be set (min 16 chars)")
  process.exit(1)
}

const httpServer = createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/plain" })
  res.end("terminal-gateway\n")
})

const wss = new WebSocketServer({ server: httpServer, path: PATH })

wss.on("connection", (ws) => {
  let ptyProc: pty.IPty | null = null
  let authed = false
  let userId: string | undefined
  let sessionId: string | undefined
  let authTimer: NodeJS.Timeout | null = setTimeout(() => {
    if (!authed) {
      logWarn("connection closed - auth timeout")
      ws.close(4401, "auth timeout")
    }
  }, 10_000)

  let idleTimer: NodeJS.Timeout | null = null
  let maxTimer: NodeJS.Timeout | null = null

  const bumpIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      logInfo("session idle timeout", { userId, sessionId })
      cleanup()
      try {
        ws.close(4408, "idle")
      } catch {
        /* noop */
      }
    }, IDLE_MS)
  }

  const cleanup = () => {
    if (authTimer) {
      clearTimeout(authTimer)
      authTimer = null
    }
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
    if (maxTimer) {
      clearTimeout(maxTimer)
      maxTimer = null
    }
    if (ptyProc) {
      try {
        ptyProc.kill()
      } catch {
        /* noop */
      }
      ptyProc = null
    }
    logInfo("session ended", { userId, sessionId })
  }

  ws.on("message", (raw) => {
    let msg: { t?: string; token?: string; d?: string; cols?: number; rows?: number }
    try {
      msg = JSON.parse(raw.toString("utf8")) as typeof msg
    } catch {
      return
    }

    if (!authed) {
      if (msg.t !== "auth" || !msg.token) return
      try {
        const decoded = jwt.verify(msg.token, SECRET, { algorithms: ["HS256"] }) as AuthPayload
        if (decoded.typ !== "terminal_gateway" || !decoded.sub || !decoded.sid) {
          ws.close(4403, "invalid token")
          return
        }
        userId = decoded.sub
        sessionId = decoded.sid
      } catch (e) {
        logWarn("jwt verify failed", { err: String(e) })
        ws.close(4403, "invalid token")
        return
      }

      if (authTimer) {
        clearTimeout(authTimer)
        authTimer = null
      }
      authed = true

      const cols = Math.min(120, MAX_COLS)
      const rows = Math.min(40, MAX_ROWS)

      try {
        ptyProc = pty.spawn(SHELL, [], {
          name: "xterm-256color",
          cols,
          rows,
          cwd: CWD,
          env: allowEnv(),
        })
      } catch (e) {
        logError("pty spawn failed", { err: String(e), userId, sessionId })
        ws.close(1010, "spawn failed")
        return
      }

      logInfo("pty spawned", { userId, sessionId, shell: SHELL, cwd: CWD })

      ptyProc.onData((data: string) => {
        bumpIdle()
        const d = Buffer.from(data, "utf8").toString("base64")
        try {
          ws.send(JSON.stringify({ t: "out", d }))
        } catch {
          cleanup()
        }
      })

      ptyProc.onExit((e) => {
        logInfo("pty exit", { userId, sessionId, code: e.exitCode, signal: e.signal })
        cleanup()
        try {
          ws.close(1000, "pty exit")
        } catch {
          /* noop */
        }
      })

      maxTimer = setTimeout(() => {
        logInfo("session max duration", { userId, sessionId })
        cleanup()
        try {
          ws.close(4408, "max duration")
        } catch {
          /* noop */
        }
      }, MAX_MS)

      bumpIdle()
      try {
        ws.send(JSON.stringify({ t: "ready", sessionId }))
      } catch {
        cleanup()
      }
      return
    }

    if (!ptyProc) return

    if (msg.t === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
      const c = Math.max(2, Math.min(MAX_COLS, Math.floor(msg.cols)))
      const r = Math.max(2, Math.min(MAX_ROWS, Math.floor(msg.rows)))
      try {
        ptyProc.resize(c, r)
      } catch {
        /* noop */
      }
      bumpIdle()
      return
    }

    if (msg.t === "in" && typeof msg.d === "string") {
      try {
        ptyProc.write(msg.d)
      } catch {
        /* noop */
      }
      bumpIdle()
    }
  })

  ws.on("close", () => {
    cleanup()
  })

  ws.on("error", () => {
    cleanup()
  })
})

httpServer.listen(PORT, HOST, () => {
  logInfo("terminal-gateway listening", { host: HOST, port: PORT, path: PATH })
})
