/**
 * @file src/modules/oms/adapters/exchange-adapter.ts
 * @module oms
 * @description Exchange adapter interface and mock implementation
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable } from '@nestjs/common';
import { ExecutionGatewayService } from '@obsidian/backend-execution-gateway';

export type TimeInForce = 'DAY' | 'IOC' | 'GTC' | 'FOK';

export type PlaceOrderRequest = {
  tenantId: string;
  accountId: string;
  instrumentId: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string | null;
  clientOrderId: string;
  timeInForce: TimeInForce;
};

export type PlaceOrderResponse = {
  providerOrderId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'PENDING';
  reason?: string;
};

export type ModifyOrderRequest = {
  providerOrderId: string;
  price?: string | null;
  quantity?: string | null;
  timeInForce?: TimeInForce;
};

export type ModifyOrderResponse = {
  providerOrderId: string;
  status: 'ACCEPTED' | 'REJECTED';
  reason?: string;
};

export type CancelOrderRequest = {
  providerOrderId: string;
};

export type CancelOrderResponse = {
  providerOrderId: string;
  status: 'CANCELLED' | 'REJECTED';
  reason?: string;
};

export const EXCHANGE_ADAPTER = 'EXCHANGE_ADAPTER';

export interface ExchangeAdapter {
  placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResponse>;
  modifyOrder(req: ModifyOrderRequest): Promise<ModifyOrderResponse>;
  cancelOrder(req: CancelOrderRequest): Promise<CancelOrderResponse>;
}

@Injectable()
export class OmsExecutionGatewayAdapter implements ExchangeAdapter {
  constructor(private readonly executionGatewayService: ExecutionGatewayService) {}

  async placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    const connectorFamily = this.executionGatewayService.resolveFamilyByInstrument(req.instrumentId);
    const response = await this.executionGatewayService.routePlaceOrder({
      ...req,
      connectorFamily,
    });
    return {
      providerOrderId: response.providerOrderId,
      status:
        response.status === 'REJECTED'
          ? 'REJECTED'
          : response.status === 'ACCEPTED'
            ? 'ACCEPTED'
            : 'PENDING',
      reason: response.reason,
    };
  }

  async modifyOrder(req: ModifyOrderRequest): Promise<ModifyOrderResponse> {
    const connectorFamily = this.inferFamilyByProviderOrderId(req.providerOrderId);
    const response = await this.executionGatewayService.routeModifyOrder({
      ...req,
      connectorFamily,
    });
    return {
      providerOrderId: response.providerOrderId,
      status: response.status === 'REJECTED' ? 'REJECTED' : 'ACCEPTED',
      reason: response.reason,
    };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<CancelOrderResponse> {
    const connectorFamily = this.inferFamilyByProviderOrderId(req.providerOrderId);
    const response = await this.executionGatewayService.routeCancelOrder({
      ...req,
      connectorFamily,
    });
    return {
      providerOrderId: response.providerOrderId,
      status: response.status === 'CANCELLED' ? 'CANCELLED' : 'REJECTED',
      reason: response.reason,
    };
  }

  private inferFamilyByProviderOrderId(providerOrderId: string):
    | 'FX_CFD'
    | 'EQUITIES_FNO'
    | 'US_EQUITIES_OPTIONS'
    | 'CRYPTO_CEX'
    | 'COMMODITIES' {
    const value = providerOrderId.toLowerCase();
    if (value.startsWith('fx_cfd-')) return 'FX_CFD';
    if (value.startsWith('us_equities_options-')) return 'US_EQUITIES_OPTIONS';
    if (value.startsWith('crypto_cex-')) return 'CRYPTO_CEX';
    if (value.startsWith('commodities-')) return 'COMMODITIES';
    return 'EQUITIES_FNO';
  }
}

export class MockExchangeAdapter implements ExchangeAdapter {
  async placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    // Always accept; real adapters will call upstream APIs with auth
    const hash = Math.abs([...`${req.clientOrderId}`].reduce((a, c) => a + c.charCodeAt(0), 0)).toString(36);
    return { providerOrderId: `mock-${hash}`, status: 'ACCEPTED' };
  }

  async modifyOrder(req: ModifyOrderRequest): Promise<ModifyOrderResponse> {
    return { providerOrderId: req.providerOrderId, status: 'ACCEPTED' };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<CancelOrderResponse> {
    return { providerOrderId: req.providerOrderId, status: 'CANCELLED' };
  }
}

export class NseConnectAdapter implements ExchangeAdapter {
  async placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    // Simulated acceptance with provider id derived from clientOrderId for traceability
    const hash = Math.abs([...`${req.clientOrderId}`].reduce((a, c) => a + c.charCodeAt(0), 0)).toString(36);
    return { providerOrderId: `nse-${hash}`, status: 'ACCEPTED' };
  }

  async modifyOrder(req: ModifyOrderRequest): Promise<ModifyOrderResponse> {
    return { providerOrderId: req.providerOrderId, status: 'ACCEPTED' };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<CancelOrderResponse> {
    return { providerOrderId: req.providerOrderId, status: 'CANCELLED' };
  }
}


