/**
 * @file route.ts
 * @module maintenance-status-api
 * @description API route to get maintenance mode status
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-03
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMaintenanceStatusAsync } from '@/lib/maintenance';
import { baseLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';

const log = baseLogger.child({ module: 'maintenance-status-api' });

/**
 * Maintenance Status API Endpoint
 * 
 * GET /api/maintenance/status
 * 
 * Returns current maintenance mode status from database
 * Used by frontend to check maintenance state
 * 
 * @param request - Next.js request object
 * @returns NextResponse - JSON response with maintenance status
 */
export async function GET(_request: NextRequest) {
  log.info({ event: 'maintenance_status_requested' }, 'GET /api/maintenance/status');
  
  try {
    const status = await getMaintenanceStatusAsync();
    
    log.info(
      { isMaintenanceMode: status.isMaintenanceMode, hasMessage: Boolean(status.message) },
      'maintenance_status_ok',
    );
    
    return NextResponse.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error({ err: error }, 'maintenance_status_failed');
    
    return NextResponse.json({
      success: false,
      error: 'Failed to get maintenance status',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}