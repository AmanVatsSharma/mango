import { NextResponse } from 'next/server'
import { metricsText } from '@/lib/observability/metrics'
import { config } from '@/lib/config/runtime'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!config.feature.metrics) {
    return new NextResponse('metrics disabled', { status: 404 })
  }
  const body = await metricsText()
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  })
}
