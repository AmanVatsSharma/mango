/**
 * @file src/modules/oms/controllers/orders.controller.ts
 * @module oms
 * @description Orders REST controller
 * @author BharatERP
 * @created 2025-09-19
 */

import { Body, Controller, MessageEvent, Post, Sse, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PlaceOrderDto, CancelOrderDto, ModifyOrderDto } from '../dtos/order.dto';
import { AddExecutionDto } from '../dtos/execution.dto';
import { OrderService } from '../services/order.service';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppLoggerService } from '../../../shared/logger';

@ApiTags('OMS')
@Controller('orders')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly service: OrderService, private readonly logger: AppLoggerService) {
    this.logger.setContext(OrdersController.name);
  }

  @Post()
  @Permissions('orders:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Place order' })
  @ApiBody({
    type: PlaceOrderDto,
    examples: {
      limitBuy: {
        value: {
          accountId: 'acc-uuid',
          instrumentId: 'inst-uuid',
          side: 'BUY',
          type: 'LIMIT',
          quantity: '10',
          price: '123.45',
          timeInForce: 'DAY',
          externalRefId: 'ext-ord-001',
          clientOrderId: 'cli-001',
        },
      },
      marketSell: {
        value: {
          accountId: 'acc-uuid',
          instrumentId: 'inst-uuid',
          side: 'SELL',
          type: 'MARKET',
          quantity: '5',
          timeInForce: 'IOC',
          externalRefId: 'ext-ord-002',
          clientOrderId: 'cli-002',
        },
      },
    },
  })
  place(@Body() dto: PlaceOrderDto) {
    this.logger.debug('place called', dto);
    return this.service.place(dto);
  }

  @Post('cancel')
  @Permissions('orders:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Cancel order' })
  @ApiBody({ type: CancelOrderDto, examples: { default: { value: { orderId: 'ord-uuid' } } } })
  cancel(@Body() dto: CancelOrderDto) {
    this.logger.debug('cancel called', dto);
    return this.service.cancel(dto);
  }

  @Post('modify')
  @Permissions('orders:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Modify/replace order' })
  @ApiBody({ type: ModifyOrderDto, examples: { default: { value: { orderId: 'ord-uuid', price: '123.45', quantity: '15', timeInForce: 'IOC' } } } })
  modify(@Body() dto: ModifyOrderDto) {
    this.logger.debug('modify called', dto);
    return this.service.modify(dto);
  }

  @Post('executions')
  @Permissions('orders:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Add execution' })
  @ApiBody({
    type: AddExecutionDto,
    examples: {
      fill: {
        value: {
          orderId: 'ord-uuid',
          accountId: 'acc-uuid',
          instrumentId: 'inst-uuid',
          quantity: '2',
          price: '124.00',
          fees: '0.25',
          externalRefId: 'exch-abc-123',
        },
      },
    },
  })
  addExecution(@Body() dto: AddExecutionDto) {
    this.logger.debug('addExecution called', dto);
    return this.service.addExecution(dto);
  }

  @Sse('stream')
  @Permissions('orders:read')
  stream(): AsyncIterable<MessageEvent> {
    const source = this.service.onEvents$();
    return {
      [Symbol.asyncIterator]() {
        const iterator = source[Symbol.asyncIterator]?.();
        if (iterator) return iterator as any;
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


