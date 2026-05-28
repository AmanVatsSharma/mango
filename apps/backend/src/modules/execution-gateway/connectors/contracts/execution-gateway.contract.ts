/**
 * @file src/modules/execution-gateway/connectors/contracts/execution-gateway.contract.ts
 * @module execution-gateway
 * @description Canonical execution-gateway contracts for global exchange connector packs
 * @author BharatERP
 * @created 2026-02-17
 */

export type ConnectorFamily =
  | 'FX_CFD'
  | 'EQUITIES_FNO'
  | 'US_EQUITIES_OPTIONS'
  | 'CRYPTO_CEX'
  | 'COMMODITIES';

export type GatewayOrderRequest = {
  tenantId: string;
  accountId: string;
  instrumentId: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string | null;
  clientOrderId: string;
  timeInForce: 'DAY' | 'IOC' | 'GTC' | 'FOK';
  connectorFamily: ConnectorFamily;
};

export type GatewayModifyOrderRequest = {
  providerOrderId: string;
  connectorFamily: ConnectorFamily;
  price?: string | null;
  quantity?: string | null;
  timeInForce?: 'DAY' | 'IOC' | 'GTC' | 'FOK';
};

export type GatewayCancelOrderRequest = {
  providerOrderId: string;
  connectorFamily: ConnectorFamily;
};

export type GatewayOrderResponse = {
  providerOrderId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'PENDING' | 'CANCELLED';
  reason?: string;
  message?: string | null;
  filledQty?: string | null;
  price?: string | null;
};

export type PositionSnapshot = {
  accountId: string;
  instrumentId: string;
  quantity: string;
  averagePrice: string;
};

export type BalanceSnapshot = {
  accountId: string;
  currency: string;
  available: string;
  utilizedMargin: string;
};

export type SymbolDefinition = {
  instrumentId: string;
  exchange: string;
  tickSize: string;
  lotSize: string;
};

export type SessionState = {
  connectorFamily: ConnectorFamily;
  status: 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED';
  updatedAt: string;
};

export type WebhookEnvelope = {
  connectorFamily: ConnectorFamily;
  eventType: string;
  payload: Record<string, unknown>;
};

export interface ExecutionConnector {
  readonly family: ConnectorFamily;
  placeOrder(request: GatewayOrderRequest): Promise<GatewayOrderResponse>;
  modifyOrder(request: GatewayModifyOrderRequest): Promise<GatewayOrderResponse>;
  cancelOrder(request: GatewayCancelOrderRequest): Promise<GatewayOrderResponse>;
  getPositions(tenantId: string, accountId: string): Promise<PositionSnapshot[]>;
  getBalances(tenantId: string, accountId: string): Promise<BalanceSnapshot[]>;
  listSymbols(): Promise<SymbolDefinition[]>;
  getSession(): Promise<SessionState>;
  handleWebhook(payload: WebhookEnvelope): Promise<void>;
}
