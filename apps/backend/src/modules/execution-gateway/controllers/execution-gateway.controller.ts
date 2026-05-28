/**
 * @file src/modules/execution-gateway/controllers/execution-gateway.controller.ts
 * @module execution-gateway
 * @description API controller for connector routing and webhook ingestion
 * @author BharatERP
 * @created 2026-02-17
 */

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ConnectorFamily } from '../connectors/contracts/execution-gateway.contract';
import {
  RouteCancelOrderDto,
  RouteModifyOrderDto,
  RouteOrderDto,
} from '../dtos/route-order.dto';
import { ExecutionGatewayService } from '../services/execution-gateway.service';

@Controller('execution-gateway')
export class ExecutionGatewayController {
  constructor(private readonly executionGatewayService: ExecutionGatewayService) {}

  @Post('orders/place')
  async place(@Body() dto: RouteOrderDto) {
    return this.executionGatewayService.routePlaceOrder(dto);
  }

  @Post('orders/modify')
  async modify(@Body() dto: RouteModifyOrderDto) {
    return this.executionGatewayService.routeModifyOrder(dto);
  }

  @Post('orders/cancel')
  async cancel(@Body() dto: RouteCancelOrderDto) {
    return this.executionGatewayService.routeCancelOrder(dto);
  }

  @Get('connectors')
  async listConnectors(@Query('tenantId') tenantId: string) {
    return this.executionGatewayService.listConnectorStatus(tenantId);
  }

  @Post('webhooks/:family')
  async webhook(
    @Param('family') family: string,
    @Body() payload: Record<string, unknown>,
  ) {
    const eventTypeValue = payload['eventType'];
    const eventType =
      typeof eventTypeValue === 'string' && eventTypeValue.length > 0
        ? eventTypeValue
        : 'UNKNOWN';
    await this.executionGatewayService.ingestWebhook({
      connectorFamily: this.normalizeFamily(family),
      eventType,
      payload,
    });
    return { accepted: true };
  }

  private normalizeFamily(value: string): ConnectorFamily {
    const normalized = value.toUpperCase();
    if (normalized === 'FX_CFD') return 'FX_CFD';
    if (normalized === 'EQUITIES_FNO') return 'EQUITIES_FNO';
    if (normalized === 'US_EQUITIES_OPTIONS') return 'US_EQUITIES_OPTIONS';
    if (normalized === 'CRYPTO_CEX') return 'CRYPTO_CEX';
    return 'COMMODITIES';
  }
}
