export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'
import { createFundManagementService } from '@/lib/services/funds/FundManagementService'
import { createTradingLogger } from '@/lib/services/logging/TradingLogger'
import { withApiTelemetry } from "@/lib/observability/api-telemetry"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import {
  assertRequestedUserScope,
  assertTradingAccountOwnership,
  requireAuthenticatedUserId,
  resolveTradingErrorResponse,
} from "@/lib/server/trading-access"

function normalizeFundOperationType(value: unknown): "BLOCK" | "RELEASE" | "CREDIT" | "DEBIT" | null {
  if (typeof value !== "string") {
    return null
  }
  const normalizedToken = value.trim().toUpperCase().replace(/[\s-]+/g, "_")
  if (!normalizedToken) {
    return null
  }
  if (normalizedToken === "BLOCK" || normalizedToken === "BLOCK_MARGIN" || normalizedToken === "MARGIN_BLOCK") {
    return "BLOCK"
  }
  if (normalizedToken === "RELEASE" || normalizedToken === "RELEASE_MARGIN" || normalizedToken === "MARGIN_RELEASE") {
    return "RELEASE"
  }
  if (normalizedToken === "CREDIT" || normalizedToken === "ADD") {
    return "CREDIT"
  }
  if (normalizedToken === "DEBIT" || normalizedToken === "SUBTRACT") {
    return "DEBIT"
  }
  return null
}

export async function POST(req: Request) {
  console.log("🌐 [API-FUNDS] POST request received")
  
  try {
    const { result } = await withApiTelemetry(req, { name: "trading_funds_post" }, async () => {
      const authenticatedUserId = await requireAuthenticatedUserId()
      const body = await req.json()
      console.log("📝 [API-FUNDS] Request body:", body)
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
      }
      
      const { tradingAccountId, amount, type, description, userId } = body
      const normalizedTradingAccountId = typeof tradingAccountId === "string" ? tradingAccountId.trim() : tradingAccountId
      const hasTypeInput =
        type !== null &&
        type !== undefined &&
        (typeof type !== "string" || type.trim().length > 0)
      const normalizedType = normalizeFundOperationType(type)
      const normalizedAmount = parseFiniteTradingNumber(amount)
      const normalizedDescription =
        typeof description === "string"
          ? description.trim().replace(/\s+/g, " ").slice(0, 256)
          : ""
      assertRequestedUserScope(userId, authenticatedUserId)

      if (!normalizedTradingAccountId || normalizedAmount === null || normalizedAmount <= 0 || !hasTypeInput) {
        console.error("❌ [API-FUNDS] Missing required fields:", { tradingAccountId, amount, type })
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }
      if (normalizedType === null) {
        console.error("❌ [API-FUNDS] Invalid operation type:", type)
        return NextResponse.json({ error: "Invalid operation type" }, { status: 400 })
      }
      await assertTradingAccountOwnership(normalizedTradingAccountId, authenticatedUserId)

      console.log("💰 [API-FUNDS] Processing fund operation:", {
        tradingAccountId: normalizedTradingAccountId,
        amount: normalizedAmount,
        type: normalizedType,
      })

      // Create logger with context
      const logger = createTradingLogger({
        tradingAccountId: normalizedTradingAccountId,
        userId: authenticatedUserId,
        clientId: authenticatedUserId
      })

      // Create service and execute operation
      const fundService = createFundManagementService(logger)
      let fundResult

      switch (normalizedType) {
        case 'BLOCK':
          console.log("🔒 [API-FUNDS] Executing BLOCK operation")
          fundResult = await fundService.blockMargin(
            normalizedTradingAccountId, 
            normalizedAmount, 
            normalizedDescription || 'Margin blocked for order'
          )
          break
        
        case 'RELEASE':
          console.log("🔓 [API-FUNDS] Executing RELEASE operation")
          fundResult = await fundService.releaseMargin(
            normalizedTradingAccountId, 
            normalizedAmount, 
            normalizedDescription || 'Margin released'
          )
          break
        
        case 'CREDIT':
          console.log("💰 [API-FUNDS] Executing CREDIT operation")
          fundResult = await fundService.credit(
            normalizedTradingAccountId, 
            normalizedAmount, 
            normalizedDescription || 'Credit'
          )
          break
        
        case 'DEBIT':
          console.log("💸 [API-FUNDS] Executing DEBIT operation")
          fundResult = await fundService.debit(
            normalizedTradingAccountId, 
            normalizedAmount, 
            normalizedDescription || 'Debit'
          )
          break
        
        default:
          console.error("❌ [API-FUNDS] Invalid operation type:", type)
          return NextResponse.json({ error: 'Invalid operation type' }, { status: 400 })
      }
      
      console.log("✅ [API-FUNDS] Fund operation completed successfully")
      console.log("🎉 [API-FUNDS] Fund operation result:", fundResult)
      
      return NextResponse.json(fundResult, { status: 200 })
    })

    return result
  } catch (error) {
    console.error('❌ [API-FUNDS] Fund management error:', error)
    const { message: errorMessage, status: statusCode } = resolveTradingErrorResponse(error, "Unknown error", 500)
    console.log("📤 [API-FUNDS] Sending error response:", errorMessage)
    
    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}
