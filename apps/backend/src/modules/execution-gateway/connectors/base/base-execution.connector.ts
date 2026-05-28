/**
 * @file src/modules/execution-gateway/connectors/base/base-execution.connector.ts
 * @module execution-gateway
 * @description Base connector implementation for shared pack behavior
 * @author BharatERP
 * @created 2026-02-17
 */

import { AppLoggerService } from '../../../../shared/logger';
import {
  BalanceSnapshot,
  ConnectorFamily,
  ExecutionConnector,
  GatewayCancelOrderRequest,
  GatewayModifyOrderRequest,
  GatewayOrderRequest,
  GatewayOrderResponse,
  PositionSnapshot,
  SessionState,
  SymbolDefinition,
  WebhookEnvelope,
} from '../contracts/execution-gateway.contract';

export abstract class BaseExecutionConnector implements ExecutionConnector {
  abstract readonly family: ConnectorFamily;

  constructor(protected readonly logger: AppLoggerService) {}

  protected orderId(prefix: string, clientOrderId: string): string {
    const hash = Math.abs([...clientOrderId].reduce((sum, char) => sum + char.charCodeAt(0), 0)).toString(36);
    return `${prefix}-${hash}`;
  }

  async placeOrder(request: GatewayOrderRequest): Promise<GatewayOrderResponse> {
    this.logger.debug('connector.placeOrder', { family: this.family, request });
    return {
      providerOrderId: this.orderId(this.family.toLowerCase(), request.clientOrderId),
      status: 'ACCEPTED',
    };
  }

  async modifyOrder(request: GatewayModifyOrderRequest): Promise<GatewayOrderResponse> {
    this.logger.debug('connector.modifyOrder', { family: this.family, request });
    return {
      providerOrderId: request.providerOrderId,
      status: 'ACCEPTED',
    };
  }

  async cancelOrder(request: GatewayCancelOrderRequest): Promise<GatewayOrderResponse> {
    this.logger.debug('connector.cancelOrder', { family: this.family, request });
    return {
      providerOrderId: request.providerOrderId,
      status: 'CANCELLED',
    };
  }

  async getPositions(_tenantId: string, accountId: string): Promise<PositionSnapshot[]> {
    return [
      {
        accountId,
        instrumentId: `${this.family}-DEMO`,
        quantity: '0',
        averagePrice: '0',
      },
    ];
  }

  async getBalances(_tenantId: string, accountId: string): Promise<BalanceSnapshot[]> {
    return [
      {
        accountId,
        currency: 'USD',
        available: '0',
        utilizedMargin: '0',
      },
    ];
  }

  async listSymbols(): Promise<SymbolDefinition[]> {
    return [
      {
        instrumentId: `${this.family}-SYMBOL-1`,
        exchange: this.family,
        tickSize: '0.01',
        lotSize: '1',
      },
    ];
  }

  async getSession(): Promise<SessionState> {
    return {
      connectorFamily: this.family,
      status: 'CONNECTED',
      updatedAt: new Date().toISOString(),
    };
  }

  async handleWebhook(payload: WebhookEnvelope): Promise<void> {
    this.logger.debug('connector.handleWebhook', payload);
  }
}
