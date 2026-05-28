/**
 * @file wait-for-order-terminal.ts
 * @module hooks
 * @description Client helper to wait until an order reaches a terminal state using the canonical status API.
 * This gives a robust UX on serverless deployments where SSE events may not always arrive cross-instance.
 * @author StockTrade
 * @created 2026-02-03
 */

"use client"

export type OrderTerminalStatus = "EXECUTED" | "CANCELLED"
export type OrderNonTerminalStatus = "PENDING"

export type OrderStatusResponse = {
  success: boolean
  orderId: string
  status: OrderNonTerminalStatus | OrderTerminalStatus | string
  symbol?: string
  quantity?: number
  price?: number | null
  averagePrice?: number | null
  filledQuantity?: number
  createdAt?: string
  executedAt?: string | null
  message?: string
}

export type WaitForOrderTerminalOptions = {
  timeoutMs?: number
  /**
   * Fast-poll cadence (ms). We will iterate this array once, then stick to the last value.
   */
  intervalsMs?: number[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function fetchOrderStatus(orderId: string): Promise<OrderStatusResponse> {
  // 6s timeout. This is called in a polling loop after order placement; a
  // single hung response would otherwise stall the polling chain. The caller
  // already retries on rejected promises (that's the wait-for-terminal loop),
  // so timing out and letting the caller retry on the next tick is exactly
  // the recovery semantics we want.
  const res = await fetch(`/api/trading/orders/status?orderId=${encodeURIComponent(orderId)}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(6_000),
  })

  if (!res.ok) {
    let msg = `Failed to fetch order status (${res.status})`
    try {
      const body = await res.json()
      msg = body?.error || body?.message || msg
    } catch {
      // ignore
    }
    throw new Error(msg)
  }

  return res.json()
}

export async function waitForOrderTerminal(
  orderId: string,
  options: WaitForOrderTerminalOptions = {},
): Promise<OrderStatusResponse> {
  const timeoutMs = Math.max(1500, options.timeoutMs ?? 7000)
  const intervalsMs = options.intervalsMs ?? [150, 150, 200, 250, 350, 500, 800, 1200, 2000]
  const start = Date.now()

  console.log("⏳ [ORDER-SYNC] Waiting for order terminal status", { orderId, timeoutMs })

  let attempt = 0
  let last: OrderStatusResponse | null = null

  while (Date.now() - start < timeoutMs) {
    attempt++
    try {
      const status = await fetchOrderStatus(orderId)
      last = status

      const s = String(status.status || "")
      if (s === "EXECUTED" || s === "CANCELLED") {
        console.log("✅ [ORDER-SYNC] Order reached terminal state", { orderId, status: s, attempt })
        return status
      }
    } catch (e) {
      // Network errors should not break UX; keep retrying until timeout.
      console.warn("⚠️ [ORDER-SYNC] Status poll failed (will retry)", {
        orderId,
        attempt,
        message: (e as any)?.message || String(e),
      })
    }

    const idx = Math.min(intervalsMs.length - 1, attempt - 1)
    await sleep(intervalsMs[idx]!)
  }

  console.warn("⚠️ [ORDER-SYNC] Timed out waiting for terminal status", { orderId, attempt })
  // Return last known snapshot if available so caller can decide next steps.
  if (last) return last
  return { success: false, orderId, status: "PENDING", message: "Timed out waiting for order status" }
}

