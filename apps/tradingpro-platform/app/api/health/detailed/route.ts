/**
 * Detailed Health Check API
 * 
 * Returns comprehensive system health information
 */

import { NextResponse } from 'next/server'
import { createHealthCheckService } from '@/lib/services/monitoring/HealthCheckService'

export async function GET(req: Request) {
  console.log("🏥 [API-HEALTH-DETAILED] GET request received")
  
  try {
    const healthService = createHealthCheckService()
    
    // Get comprehensive health check
    const health = await healthService.performHealthCheck()
    
    // Get system statistics
    const stats = await healthService.getSystemStats()
    
    console.log("✅ [API-HEALTH-DETAILED] Health check completed:", health.status)
    
    return NextResponse.json({
      ...health,
      stats
    }, { 
      status: health.status === 'healthy' ? 200 : health.status === 'degraded' ? 207 : 503 
    })
  } catch (error: any) {
    console.error("❌ [API-HEALTH-DETAILED] Health check failed:", error)
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message || 'Health check failed'
    }, { status: 503 })
  }
}
