/**
 * @file src/modules/execution-gateway/dtos/route-order.dto.ts
 * @module execution-gateway
 * @description DTOs for normalized execution gateway routing endpoints
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { ConnectorFamily } from '../connectors/contracts/execution-gateway.contract';

const connectorValues: ConnectorFamily[] = [
  'FX_CFD',
  'EQUITIES_FNO',
  'US_EQUITIES_OPTIONS',
  'CRYPTO_CEX',
  'COMMODITIES',
];

export class RouteOrderDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  accountId!: string;

  @IsString()
  @IsNotEmpty()
  instrumentId!: string;

  @IsIn(['BUY', 'SELL'])
  side!: 'BUY' | 'SELL';

  @IsIn(['MARKET', 'LIMIT'])
  type!: 'MARKET' | 'LIMIT';

  @Matches(/^\d+(\.\d+)?$/)
  quantity!: string;

  @IsOptional()
  @Matches(/^\d+(\.\d+)?$/)
  price?: string;

  @IsString()
  @IsNotEmpty()
  clientOrderId!: string;

  @IsIn(['DAY', 'IOC', 'GTC', 'FOK'])
  timeInForce!: 'DAY' | 'IOC' | 'GTC' | 'FOK';

  @IsIn(connectorValues)
  connectorFamily!: ConnectorFamily;
}

export class RouteModifyOrderDto {
  @IsString()
  @IsNotEmpty()
  providerOrderId!: string;

  @IsIn(connectorValues)
  connectorFamily!: ConnectorFamily;

  @IsOptional()
  @Matches(/^\d+(\.\d+)?$/)
  price?: string;

  @IsOptional()
  @Matches(/^\d+(\.\d+)?$/)
  quantity?: string;

  @IsOptional()
  @IsIn(['DAY', 'IOC', 'GTC', 'FOK'])
  timeInForce?: 'DAY' | 'IOC' | 'GTC' | 'FOK';
}

export class RouteCancelOrderDto {
  @IsString()
  @IsNotEmpty()
  providerOrderId!: string;

  @IsIn(connectorValues)
  connectorFamily!: ConnectorFamily;
}
