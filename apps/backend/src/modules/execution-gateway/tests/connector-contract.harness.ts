/**
 * @file src/modules/execution-gateway/tests/connector-contract.harness.ts
 * @module execution-gateway
 * @description Reusable contract harness for connector pack tests
 * @author BharatERP
 * @created 2026-02-17
 */

import { ExecutionConnector, GatewayOrderRequest } from '../connectors/contracts/execution-gateway.contract';

export async function assertConnectorContract(connector: ExecutionConnector): Promise<void> {
  const req: GatewayOrderRequest = {
    tenantId: '8a9f5719-4c84-400f-8c2b-2a5f7e5f0fcf',
    accountId: 'f4f59c75-0dfd-47dd-8f7d-bbe98d44f428',
    instrumentId: 'NSE:SBIN',
    side: 'BUY',
    type: 'LIMIT',
    quantity: '1',
    price: '100',
    clientOrderId: `cli-${connector.family}`,
    timeInForce: 'DAY',
    connectorFamily: connector.family,
  };

  const placed = await connector.placeOrder(req);
  expect(placed.providerOrderId).toBeTruthy();
  expect(['ACCEPTED', 'PENDING', 'REJECTED']).toContain(placed.status);

  const modified = await connector.modifyOrder({
    providerOrderId: placed.providerOrderId,
    connectorFamily: connector.family,
    price: '101',
  });
  expect(['ACCEPTED', 'REJECTED']).toContain(modified.status);

  const cancelled = await connector.cancelOrder({
    providerOrderId: placed.providerOrderId,
    connectorFamily: connector.family,
  });
  expect(['CANCELLED', 'REJECTED']).toContain(cancelled.status);

  const positions = await connector.getPositions(req.tenantId, req.accountId);
  const balances = await connector.getBalances(req.tenantId, req.accountId);
  const symbols = await connector.listSymbols();
  const session = await connector.getSession();

  expect(Array.isArray(positions)).toBe(true);
  expect(Array.isArray(balances)).toBe(true);
  expect(Array.isArray(symbols)).toBe(true);
  expect(session.connectorFamily).toBe(connector.family);
}
