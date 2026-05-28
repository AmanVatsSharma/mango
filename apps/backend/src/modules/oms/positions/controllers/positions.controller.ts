/**
 * @file src/modules/oms/positions/controllers/positions.controller.ts
 * @module oms-positions
 * @description Positions REST + SSE endpoints
 * @author BharatERP
 * @created 2025-09-19
 */

import { Controller, Get, Param, Query, Sse, UseGuards, MessageEvent } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../../rbac/guards/tenant.guard';
import { PositionsService } from '../services/positions.service';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppLoggerService } from '../../../../shared/logger';
import { OrderEventsService } from '../../services/order-events.service';

@ApiTags('Positions')
@Controller('positions')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class PositionsController {
  constructor(
    private readonly service: PositionsService,
    private readonly events: OrderEventsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(PositionsController.name);
  }

  @Get()
  @Permissions('positions:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List positions' })
  @ApiQuery({ name: 'accountId', required: true })
  @ApiQuery({ name: 'currency', required: false })
  @ApiResponse({
    status: 200,
    description: 'Positions',
    schema: {
      example: [
        {
          id: 'pos-uuid',
          accountId: 'acc-uuid',
          instrumentId: 'inst-uuid',
          quantity: '10',
          avgPrice: '120.50',
          pnl: '25.00',
          currency: 'INR',
        },
      ],
    },
  })
  list(@Query('accountId') accountId: string, @Query('currency') currency?: string) {
    this.logger.debug('positions list', { accountId, currency });
    return this.service.listPositions(accountId, currency);
  }

  @Sse('stream')
  @Permissions('positions:read')
  @ApiOperation({ summary: 'Positions SSE stream', description: 'Server-Sent Events stream of order/position events (text/event-stream)' })
  @ApiResponse({ status: 200, description: 'SSE stream' })
  stream(): AsyncIterable<MessageEvent> {
    const source = this.events.onEvents$();
    return {
      [Symbol.asyncIterator]() {
        const queue: any[] = [];
        const sub = source.subscribe((event) => queue.push({ data: event }));
        return {
          next() {
            return new Promise((resolve) => {
              const item = queue.shift();
              if (item) return resolve({ value: item, done: false });
              const unsubscribe = source.subscribe((ev) => {
                unsubscribe.unsubscribe();
                resolve({ value: { data: ev }, done: false });
              });
            });
          },
          return() {
            sub.unsubscribe();
            return Promise.resolve({ value: undefined, done: true });
          },
          throw(err: any) {
            sub.unsubscribe();
            throw err;
          },
          [Symbol.asyncIterator]() { return this; },
        } as AsyncIterator<MessageEvent>;
      },
    } as AsyncIterable<MessageEvent>;
  }
}


