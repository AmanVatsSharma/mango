/**
 * File:        apps/backend/src/modules/copy-trading/dtos/create-copy-trading-subscription.dto.ts
 * Module:      copy-trading
 * Purpose:     DTO for subscribing a slave user to a master user
 *
 * Exports:
 *   - CreateCopyTradingSubscriptionDto — subscription payload
 *
 * Depends on:
 *   - none
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. CreateCopyTradingSubscriptionDto — field definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsNotEmpty, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateCopyTradingSubscriptionDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  masterUserId!: string;

  @IsUUID()
  slaveUserId!: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  copyPct?: number;
}