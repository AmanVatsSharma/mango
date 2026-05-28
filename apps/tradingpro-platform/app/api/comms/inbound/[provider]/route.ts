/**
 * @file app/api/comms/inbound/[provider]/route.ts
 * @module api/comms
 * @description Public webhook endpoint (NOT admin) for channel providers to deliver:
 *                - inbound user replies (e.g., WhatsApp message back)
 *                - delivery status callbacks (DELIVERED / READ / FAILED)
 *
 *              Signature verification is mandatory — the registered provider for the
 *              channel must verifyInboundSignature() before any DB write. Failed
 *              verification → 401 with no body parsed.
 *
 *              The {provider} path param maps to a registry lookup — channel inferred
 *              from registered provider.channel.
 *
 *              Phase 12 ships only the LogProvider, which always returns false on
 *              verifyInboundSignature — so this route returns 401 in dev. Real vendor
 *              adapters land in Phase 12.5.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import { baseLogger as logger } from "@/lib/observability/logger"
import { listProviders } from "@/lib/comms/registry"
import { ingestInboundEvent } from "@/lib/comms/inbound"

export const dynamic = "force-dynamic"

interface RouteCtx {
  params: Promise<{ provider: string }>
}

function lowercaseHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  req.headers.forEach((v, k) => {
    out[k.toLowerCase()] = v
  })
  return out
}

export async function POST(req: Request, ctx: RouteCtx) {
  const { provider: providerName } = await ctx.params
  const adapter = listProviders().find(
    (p) => p.name.toLowerCase() === providerName.toLowerCase(),
  )
  if (!adapter) {
    return NextResponse.json(
      { success: false, message: "unknown provider" },
      { status: 404 },
    )
  }

  const rawBody = await req.text()
  const headers = lowercaseHeaders(req)

  const verified = adapter.verifyInboundSignature({ rawBody, headers })
  if (!verified) {
    logger.warn(
      { providerName },
      "[comms] inbound signature verification failed",
    )
    return NextResponse.json(
      { success: false, message: "signature verification failed" },
      { status: 401 },
    )
  }

  let events
  try {
    events = adapter.parseInbound({ rawBody, headers })
  } catch (err) {
    logger.error(
      { err, providerName },
      "[comms] inbound parse failed after signature verify",
    )
    return NextResponse.json(
      { success: false, message: "parse failed" },
      { status: 400 },
    )
  }

  let inserted = 0
  let updated = 0
  let ignored = 0
  for (const event of events) {
    const result = await ingestInboundEvent(event)
    if (result.ingested === "INSERT") inserted += 1
    else if (result.ingested === "UPDATE") updated += 1
    else ignored += 1
  }

  return NextResponse.json({
    success: true,
    inserted,
    updated,
    ignored,
    total: events.length,
  })
}
