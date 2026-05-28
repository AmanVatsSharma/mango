/**
 * Analytics API
 * 
 * Provides trading analytics and performance metrics
 */

import { NextResponse } from 'next/server'
import { TradingAnalytics } from '@/lib/services/analytics/TradingAnalytics'
import { auth } from '@/auth'
import { cacheService, CacheNamespaces, CacheTTL } from '@/lib/services/cache/CacheService'
import { normalizeApiBoundedInteger } from '@/lib/server/api-number-utils'

export async function GET(req: Request) {
  console.log("📊 [API-ANALYTICS] GET request received")
  
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'stats'
    const days = normalizeApiBoundedInteger(searchParams.get('days'), 30, 1, 3650)

    // Use cache for analytics (reduces database load)
    const cacheKey = `analytics:${session.user.id}:${type}:${days}`
    
    const data = await cacheService.getOrSet(
      cacheKey,
      async () => {
        switch (type) {
          case 'stats':
            return await TradingAnalytics.getTradingStats(session.user.id!)
          
          case 'daily':
            return await TradingAnalytics.getDailyPerformance(session.user.id!, days)
          
          case 'symbols':
            return await TradingAnalytics.getSymbolPerformance(session.user.id!)
          
          case 'risk':
            return await TradingAnalytics.getRiskMetrics(session.user.id!)
          
          default:
            throw new Error('Invalid analytics type')
        }
      },
      {
        ttl: CacheTTL.MEDIUM, // Cache for 5 minutes
        namespace: CacheNamespaces.GENERAL
      }
    )

    console.log("✅ [API-ANALYTICS] Analytics data retrieved")
    
    return NextResponse.json({
      success: true,
      type,
      data
    })
  } catch (error: any) {
    console.error("❌ [API-ANALYTICS] Error:", error)
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch analytics'
    }, { status: 500 })
  }
}
