/**
 * @file src/modules/oms/tests/order.dto.zod.spec.ts
 * @module oms-tests
 * @description Zod shape tests for PlaceOrderDto
 * @author BharatERP
 * @created 2025-09-24
 */

import { z } from 'zod';

const PlaceOrderSchema = z.object({
  accountId: z.string().min(1).max(64),
  instrumentId: z.string().min(1).max(64),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['MARKET', 'LIMIT']),
  quantity: z.string().regex(/^\d{1,20}(\.\d{1,8})?$/),
  price: z.string().regex(/^\d{1,20}(\.\d{1,8})?$/).optional(),
  clientOrderId: z.string().min(1).max(64).optional(),
  timeInForce: z.enum(['DAY', 'IOC', 'GTC', 'FOK']),
  externalRefId: z.string().min(1).max(128),
});

describe('PlaceOrderDto Zod shape', () => {
  it('accepts valid shape', () => {
    const parsed = PlaceOrderSchema.parse({
      accountId: 'a1',
      instrumentId: 'i1',
      side: 'BUY',
      type: 'LIMIT',
      quantity: '10',
      price: '1.23',
      clientOrderId: 'cli1',
      timeInForce: 'DAY',
      externalRefId: 'ext-1',
    });
    expect(parsed).toBeDefined();
  });

  it('rejects bad quantity', () => {
    expect(() =>
      PlaceOrderSchema.parse({
        accountId: 'a1',
        instrumentId: 'i1',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 'abc',
        price: '1.23',
        timeInForce: 'DAY',
        externalRefId: 'ext-1',
      }),
    ).toThrow();
  });
});


