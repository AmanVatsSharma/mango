/**
 * @file src/modules/realtime/prana-stream/services/realtime-publisher.service.ts
 * @module realtime/prana-stream
 * @description Thin publisher service to emit realtime domain updates to users
 * @author BharatERP
 * @created 2025-09-24
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { RealtimeAggregatorService } from './realtime-aggregator.service';

@Injectable()
export class RealtimePublisherService {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly aggregator: RealtimeAggregatorService,
  ) {
    this.logger.setContext(RealtimePublisherService.name);
  }

  publishOrderUpdate(userId: string, data: any) {
    this.logger.debug('publishOrderUpdate', { userId });
    this.aggregator.publishOrderUpdate(userId, data);
  }

  publishPositionUpdate(userId: string, data: any) {
    this.logger.debug('publishPositionUpdate', { userId });
    this.aggregator.publishPositionUpdate(userId, data);
  }

  publishAccountUpdate(userId: string, data: any) {
    this.logger.debug('publishAccountUpdate', { userId });
    this.aggregator.publishAccountUpdate(userId, data);
  }
}


