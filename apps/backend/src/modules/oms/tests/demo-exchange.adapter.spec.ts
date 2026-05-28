/**
 * @file src/modules/oms/tests/demo-exchange.adapter.spec.ts
 * @module oms-tests
 * @description Unit tests for DemoExchangeAdapter
 * @author BharatERP
 * @created 2026-03-15
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DemoExchangeAdapter } from '../adapters/demo-exchange.adapter';

describe('DemoExchangeAdapter', () => {
  let adapter: DemoExchangeAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DemoExchangeAdapter],
    }).compile();
    adapter = module.get(DemoExchangeAdapter);
  });

  it('placeOrder returns ACCEPTED with demo- prefixed providerOrderId', async () => {
    const resp = await adapter.placeOrder({
      tenantId: 't1',
      accountId: 'a1',
      instrumentId: 'i1',
      side: 'BUY',
      type: 'LIMIT',
      quantity: '10',
      price: '100',
      clientOrderId: 'cli-1',
      timeInForce: 'DAY',
    });
    expect(resp.status).toBe('ACCEPTED');
    expect(resp.providerOrderId).toMatch(/^demo-/);
  });

  it('modifyOrder returns ACCEPTED', async () => {
    const resp = await adapter.modifyOrder({ providerOrderId: 'demo-123', price: '101', quantity: '20' });
    expect(resp.status).toBe('ACCEPTED');
    expect(resp.providerOrderId).toBe('demo-123');
  });

  it('cancelOrder returns CANCELLED', async () => {
    const resp = await adapter.cancelOrder({ providerOrderId: 'demo-123' });
    expect(resp.status).toBe('CANCELLED');
    expect(resp.providerOrderId).toBe('demo-123');
  });
});
