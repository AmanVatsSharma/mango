/**
 * @file route.ts
 * @module maintenance-config-api
 * @description API route to get maintenance mode configuration (for edge runtime compatibility)
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-03
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMaintenanceConfigFromDB } from '@/lib/server/maintenance';
import { baseLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';

const log = baseLogger.child({ module: 'maintenance-config-api' });

/**
 * GET /api/maintenance/config
 * Returns current maintenance mode configuration
 * Used by middleware (edge runtime) to check maintenance status
 * 
 * @param request - Next.js request object
 * @returns NextResponse - JSON response with maintenance config
 */
export async function GET(_request: NextRequest) {
  log.info({ event: 'maintenance_config_requested' }, 'GET /api/maintenance/config');
  
  try {
    const config = await getMaintenanceConfigFromDB();
    
    log.info(
      { isEnabled: config.isEnabled, allowAdminBypass: config.allowAdminBypass },
      'maintenance_config_ok',
    );
    
    return NextResponse.json({
      success: true,
      config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error({ err: error }, 'maintenance_config_failed');
    
    return NextResponse.json({
      success: false,
      error: 'Failed to get maintenance config',
      config: {
        isEnabled: false,
        message: "We're performing scheduled maintenance to improve your experience. We'll be back shortly!",
        endTime: '24Hrs',
        allowAdminBypass: true
      },
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

