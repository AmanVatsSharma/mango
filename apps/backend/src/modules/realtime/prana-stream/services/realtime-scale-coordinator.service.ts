/**
 * @file src/modules/realtime/prana-stream/services/realtime-scale-coordinator.service.ts
 * @module realtime/prana-stream
 * @description Minimal stub for realtime scale coordination across instances
 * @author BharatERP
 * @created 2026-02-19
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';

/**
 * Stub for coordinating realtime streams when scaling horizontally.
 * [SonuRamTODO] Wire to Redis pub/sub or similar for multi-instance coordination.
 */
@Injectable()
export class RealtimeScaleCoordinatorService {
  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext(RealtimeScaleCoordinatorService.name);
  }

  /**
   * Stub: Register this instance for a user/session (no-op).
   */
  async registerInstance(_userId: string, _sessionId: string): Promise<void> {
    this.logger.debug('Scale coordinator stub: registerInstance (no-op)');
  }

  /**
   * Stub: Unregister instance on disconnect (no-op).
   */
  async unregisterInstance(_userId: string, _sessionId: string): Promise<void> {
    this.logger.debug('Scale coordinator stub: unregisterInstance (no-op)');
  }

  /**
   * Stub: Check if this instance should handle a user's events (always true for single-instance).
   */
  async shouldHandleUser(_userId: string): Promise<boolean> {
    return true;
  }
}
