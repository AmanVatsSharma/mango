/**
 * @file src/modules/oms/adapters/demo-exchange.adapter.ts
 * @module oms
 * @description Simulated exchange adapter for demo accounts; never calls real execution gateway
 * @author BharatERP
 * @created 2026-03-15
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  CancelOrderRequest,
  CancelOrderResponse,
  ExchangeAdapter,
  ModifyOrderRequest,
  ModifyOrderResponse,
  PlaceOrderRequest,
  PlaceOrderResponse,
} from './exchange-adapter';

export const DEMO_EXCHANGE_ADAPTER = 'DEMO_EXCHANGE_ADAPTER';

@Injectable()
export class DemoExchangeAdapter implements ExchangeAdapter {
  async placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    const providerOrderId = `demo-${randomUUID()}`;
    return { providerOrderId, status: 'ACCEPTED' };
  }

  async modifyOrder(req: ModifyOrderRequest): Promise<ModifyOrderResponse> {
    return { providerOrderId: req.providerOrderId, status: 'ACCEPTED' };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<CancelOrderResponse> {
    return { providerOrderId: req.providerOrderId, status: 'CANCELLED' };
  }
}
