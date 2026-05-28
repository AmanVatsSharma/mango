/**
 * Performance Monitoring API
 * 
 * Returns performance metrics and statistics
 */

import { NextResponse } from 'next/server'
import { performanceMonitor } from '@/lib/services/monitoring/PerformanceMonitor'
import { auth } from '@/auth'
import { normalizeApiBoundedInteger } from '@/lib/server/api-number-utils'

export async function GET(req: Request) {
  console.log("📊 [API-PERFORMANCE] GET request received")
  
  try {
    // Check if user is admin
    const session = await auth()
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'summary'

    let data: any

    switch (type) {
      case 'summary':
        data = performanceMonitor.getSummary()
        break
      
      case 'slow':
        const threshold = normalizeApiBoundedInteger(searchParams.get('threshold'), 1000, 1, 600_000)
        data = performanceMonitor.getSlowOperations(threshold)
        break
      
      case 'failed':
        const limit = normalizeApiBoundedInteger(searchParams.get('limit'), 100, 1, 10_000)
        data = performanceMonitor.getFailedOperations(limit)
        break
      
      case 'operation':
        const operation = searchParams.get('operation')
        if (!operation) {
          return NextResponse.json({ error: "Operation name required" }, { status: 400 })
        }
        data = performanceMonitor.getOperationStats(operation)
        break
      
      default:
        data = performanceMonitor.getAllStats()
    }

    console.log("✅ [API-PERFORMANCE] Performance data retrieved")
    
    return NextResponse.json({
      success: true,
      type,
      data,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error("❌ [API-PERFORMANCE] Error retrieving performance data:", error)
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to retrieve performance data'
    }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  console.log("🗑️ [API-PERFORMANCE] DELETE request received")
  
  try {
    // Check if user is admin
    const session = await auth()
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const olderThan = searchParams.get('olderThan')

    if (olderThan) {
      const ms = normalizeApiBoundedInteger(olderThan, 0, 0, 31_536_000_000)
      performanceMonitor.clearMetrics(ms)
    } else {
      performanceMonitor.clearMetrics()
    }

    console.log("✅ [API-PERFORMANCE] Metrics cleared")
    
    return NextResponse.json({
      success: true,
      message: 'Performance metrics cleared'
    })
  } catch (error: any) {
    console.error("❌ [API-PERFORMANCE] Error clearing metrics:", error)
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to clear metrics'
    }, { status: 500 })
  }
}
