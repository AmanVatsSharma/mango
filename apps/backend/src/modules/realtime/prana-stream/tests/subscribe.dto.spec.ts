/**
 * @file src/modules/realtime/prana-stream/tests/subscribe.dto.spec.ts
 * @module realtime/prana-stream
 * @description Tests for SubscribeDto validation and shape
 * @author BharatERP
 * @created 2025-09-24
 */

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubscribeDto } from '../dtos/subscribe.dto';
import { z } from 'zod';

const SubscribeSchema = z.object({
  watchlist: z
    .array(
      z.object({ exchange: z.string().min(1), symbol: z.string().min(1) })
    )
    .optional(),
  orders: z.boolean().optional(),
  positions: z.boolean().optional(),
  accounts: z.boolean().optional(),
});

describe('SubscribeDto', () => {
  it('accepts a valid payload', async () => {
    const body = {
      watchlist: [{ exchange: 'NSE', symbol: 'RELIANCE' }],
      orders: true,
      positions: true,
      accounts: true,
    };
    const dto = plainToInstance(SubscribeDto, body);
    const errs = await validate(dto);
    expect(errs.length).toBe(0);
    expect(() => SubscribeSchema.parse(body)).not.toThrow();
  });

  it('rejects invalid watchlist items', async () => {
    const dto = plainToInstance(SubscribeDto, {
      watchlist: [{ exchange: 123, symbol: '' }],
    } as any);
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });
});


