/**
 * File:        apps/backend/src/modules/oms/controllers/admin-orders.controller.ts
 * Module:      oms · Admin Orders
 * Purpose:     Broker admin endpoints for listing all tenant orders and cancelling them.
 *
 * Exports:
 *   - AdminOrdersController — NestJS controller with GET /admin/orders, POST /admin/orders/cancel
 *
 * Depends on:
 *   - ../services/order.service  — OrderService.listAll, .cancel
 *   - AppLoggerService         — structured request logging
 *   - JwtAuthGuard + TenantGuard + PermissionsGuard
 *
 * Side-effects:
 *   - POST /admin/orders/cancel transitions order status to CANCELLED
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard (tenant-scoped) + PermissionsGuard
 *   - cancel() uses the same CancelOrderDto as the user-facing endpoint (idempotent)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { OrderService } from '../services/order.service';
import { CancelOrderDto } from '../dtos/order.dto';
import { AppLoggerService } from '../../../shared/logger';

@ApiTags('admin/orders')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminOrdersController {
  constructor(
    private readonly orderService: OrderService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminOrdersController.name);
  }

  @Get()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all orders for the tenant with filters' })
  @ApiQuery({ name: 'status', required: false, description: 'NEW|PLACED|PARTIALLY_FILLED|FILLED|CANCELLED|REJECTED' })
  @ApiQuery({ name: 'side', required: false, description: 'BUY or SELL' })
  @ApiQuery({ name: 'accountId', required: false, description: 'Filter by account UUID' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'limit', required: false, example: '50' })
  @ApiQuery({ name: 'offset', required: false, example: '0' })
  @ApiResponse({ status: 200, description: 'Paginated order list' })
  async listAll(
    @Query('status') status?: string,
    @Query('side') side?: string,
    @Query('accountId') accountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.logger.debug('GET /admin/orders', { status, side, accountId, from, to, limit, offset });
    return this.orderService.listAll({
      status,
      side: side as any,
      accountId,
      from,
      to,
      limit: limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Post('cancel')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Cancel an order by ID (admin override)' })
  @ApiBody({
    schema: {
      properties: { orderId: { type: 'string', example: 'ord-uuid' } },
      required: ['orderId'],
    },
  })
  @ApiResponse({ status: 200, description: 'Cancelled order or null if not found' })
  async cancel(@Body() dto: CancelOrderDto) {
    this.logger.debug('POST /admin/orders/cancel', dto);
    return this.orderService.cancel(dto);
  }
}