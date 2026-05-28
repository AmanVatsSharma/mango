/**
 * @file src/modules/execution-gateway/services/execution-gateway.service.ts
 * @module execution-gateway
 * @description Routing service across connector families for normalized execution APIs
 * @author BharatERP
 * @created 2026-02-17
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { AppLoggerService } from '../../../shared/logger';
import { CommoditiesConnector } from '../connectors/commodities/commodities.connector';
import {
  ConnectorFamily,
  ExecutionConnector,
  GatewayCancelOrderRequest,
  GatewayModifyOrderRequest,
  GatewayOrderRequest,
  GatewayOrderResponse,
  WebhookEnvelope,
} from '../connectors/contracts/execution-gateway.contract';
import { CryptoCexConnector } from '../connectors/crypto-cex/crypto-cex.connector';
import { EquitiesFnoConnector } from '../connectors/equities-fno/equities-fno.connector';
import { FxCfdConnector } from '../connectors/fx-cfd/fx-cfd.connector';
import { UsEquitiesOptionsConnector } from '../connectors/us-equities-options/us-equities-options.connector';
import { ExecutionConnectorEntity } from '../entities/execution-connector.entity';

@Injectable()
export class ExecutionGatewayService {
  private readonly connectors: Map<ConnectorFamily, ExecutionConnector>;

  constructor(
    @InjectRepository(ExecutionConnectorEntity)
    private readonly connectorRepo: Repository<ExecutionConnectorEntity>,
    fxCfdConnector: FxCfdConnector,
    equitiesFnoConnector: EquitiesFnoConnector,
    usEquitiesOptionsConnector: UsEquitiesOptionsConnector,
    cryptoCexConnector: CryptoCexConnector,
    commoditiesConnector: CommoditiesConnector,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(ExecutionGatewayService.name);
    this.connectors = new Map<ConnectorFamily, ExecutionConnector>([
      ['FX_CFD', fxCfdConnector],
      ['EQUITIES_FNO', equitiesFnoConnector],
      ['US_EQUITIES_OPTIONS', usEquitiesOptionsConnector],
      ['CRYPTO_CEX', cryptoCexConnector],
      ['COMMODITIES', commoditiesConnector],
    ]);
  }

  resolveFamilyByInstrument(instrumentId: string): ConnectorFamily {
    const value = instrumentId.toUpperCase();
    if (value.startsWith('FX:') || value.includes('CFD')) return 'FX_CFD';
    if (value.startsWith('US:') || value.includes('OPTION')) return 'US_EQUITIES_OPTIONS';
    if (value.startsWith('CRYPTO:') || value.includes('PERP')) return 'CRYPTO_CEX';
    if (value.startsWith('CMDTY:') || value.includes('METAL') || value.includes('ENERGY')) return 'COMMODITIES';
    return 'EQUITIES_FNO';
  }

  async routePlaceOrder(request: GatewayOrderRequest): Promise<GatewayOrderResponse> {
    this.logger.debug('routePlaceOrder:start', request);
    const connector = this.getConnector(request.connectorFamily);
    const response = await connector.placeOrder(request);
    this.logger.debug('routePlaceOrder:end', response);
    return response;
  }

  async routeModifyOrder(request: GatewayModifyOrderRequest): Promise<GatewayOrderResponse> {
    this.logger.debug('routeModifyOrder:start', request);
    const connector = this.getConnector(request.connectorFamily);
    const response = await connector.modifyOrder(request);
    this.logger.debug('routeModifyOrder:end', response);
    return response;
  }

  async routeCancelOrder(request: GatewayCancelOrderRequest): Promise<GatewayOrderResponse> {
    this.logger.debug('routeCancelOrder:start', request);
    const connector = this.getConnector(request.connectorFamily);
    const response = await connector.cancelOrder(request);
    this.logger.debug('routeCancelOrder:end', response);
    return response;
  }

  async ingestWebhook(payload: WebhookEnvelope): Promise<void> {
    this.logger.debug('ingestWebhook:start', payload);
    const connector = this.getConnector(payload.connectorFamily);
    await connector.handleWebhook(payload);
    this.logger.debug('ingestWebhook:end', { family: payload.connectorFamily, eventType: payload.eventType });
  }

  async listConnectorStatus(tenantId: string): Promise<
    Array<{
      family: ConnectorFamily;
      active: boolean;
      session: string;
    }>
  > {
    const rows = await this.connectorRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
    if (!rows.length) {
      return Array.from(this.connectors.keys()).map((family) => ({
        family,
        active: true,
        session: 'CONNECTED',
      }));
    }

    const result: Array<{ family: ConnectorFamily; active: boolean; session: string }> = [];
    for (const row of rows) {
      const connector = this.getConnector(row.connectorFamily);
      const session = await connector.getSession();
      result.push({
        family: row.connectorFamily,
        active: row.active,
        session: session.status,
      });
    }
    return result;
  }

  private getConnector(family: ConnectorFamily): ExecutionConnector {
    const connector = this.connectors.get(family);
    if (!connector) {
      throw new AppError('RESOURCE_NOT_FOUND', `Connector family ${family} is not registered`);
    }
    return connector;
  }
}
