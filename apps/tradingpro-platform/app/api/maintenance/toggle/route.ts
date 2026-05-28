/**
 * @file route.ts
 * @module maintenance-toggle-api
 * @description API route to toggle maintenance mode settings in database
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-03
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { invalidateMaintenanceCache, getMaintenanceConfigAsync } from '@/lib/maintenance';
import { invalidateMaintenanceCache as invalidateServerMaintenanceCache } from '@/lib/server/maintenance';
import { canManageMaintenanceSettings } from '@/lib/maintenance-rbac';
import { baseLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';

const log = baseLogger.child({ module: 'maintenance-toggle-api' });

/**
 * Maintenance Toggle API Endpoint
 * 
 * POST /api/maintenance/toggle
 * 
 * Allows authorized users to update maintenance mode settings
 * Requires admin privileges (ADMIN or SUPER_ADMIN)
 * 
 * Request body:
 * - enabled: boolean (optional)
 * - message: string (optional)
 * - endTime: string (optional)
 * - allowAdminBypass: boolean (optional)
 * 
 * @param request - Next.js request object
 * @returns NextResponse - JSON response with updated config
 */
export async function POST(request: NextRequest) {
  log.info({ event: 'maintenance_toggle_received' }, 'POST /api/maintenance/toggle');
  
  try {
    // Authenticate user
    const session = await auth();
    const role = (session?.user as { role?: string } | undefined)?.role;
    
    if (!session?.user || !canManageMaintenanceSettings(role)) {
      log.warn(
        { userId: session?.user?.id, role },
        'maintenance_toggle_forbidden',
      );
      
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions to toggle maintenance mode. ADMIN or SUPER_ADMIN role required.',
        timestamp: new Date().toISOString()
      }, { status: 403 });
    }

    log.info({ userId: session.user.id, role }, 'maintenance_toggle_authorized');

    // Parse request body
    const body = await request.json();
    const { enabled, message, endTime, allowAdminBypass } = body;

    log.info(
      {
        enabled,
        hasMessage: message !== undefined,
        hasEndTime: endTime !== undefined,
        allowAdminBypass,
      },
      'maintenance_toggle_payload',
    );

    // Helper function to upsert a setting
    const upsertSetting = async (key: string, value: string, description: string) => {
      const existing = await prisma.systemSettings.findFirst({
        where: {
          key,
          ownerId: null
        }
      });

      if (existing) {
        return prisma.systemSettings.update({
          where: { id: existing.id },
          data: {
            value,
            category: 'MAINTENANCE',
            isActive: true,
            updatedAt: new Date()
          }
        });
      } else {
        return prisma.systemSettings.create({
          data: {
            ownerId: null,
            key,
            value,
            category: 'MAINTENANCE',
            description,
            isActive: true
          }
        });
      }
    };

    // Update settings in database
    const updates: Promise<any>[] = [];

    if (enabled !== undefined) {
      updates.push(
        upsertSetting(
          'maintenance_mode_enabled',
          String(enabled),
          'Enable or disable maintenance mode'
        )
      );
    }

    if (message !== undefined) {
      updates.push(
        upsertSetting(
          'maintenance_message',
          message,
          'Custom maintenance message displayed to users'
        )
      );
    }

    if (endTime !== undefined) {
      updates.push(
        upsertSetting(
          'maintenance_end_time',
          endTime,
          'Expected maintenance end time (ISO string or descriptive text)'
        )
      );
    }

    if (allowAdminBypass !== undefined) {
      updates.push(
        upsertSetting(
          'maintenance_allow_admin_bypass',
          String(allowAdminBypass),
          'Allow ADMIN and SUPER_ADMIN roles to bypass maintenance mode'
        )
      );
    }

    // Execute all updates
    await Promise.all(updates);

    // Invalidate cache to force refresh (Edge + Node DB layers)
    invalidateMaintenanceCache();
    invalidateServerMaintenanceCache();

    // Get updated configuration
    const updatedConfig = await getMaintenanceConfigAsync();

    log.info({ enabled: updatedConfig.isEnabled }, 'maintenance_toggle_success');
    
    return NextResponse.json({
      success: true,
      message: 'Maintenance mode settings updated successfully',
      config: updatedConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    log.error({ err: error }, 'maintenance_toggle_failed');
    
    return NextResponse.json({
      success: false,
      error: 'Failed to toggle maintenance mode',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}