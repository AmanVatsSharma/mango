/**
 * File:        apps/backend/src/modules/broker-hierarchy/dtos/broker-exchange-config.dto.ts
 * Module:      broker-hierarchy
 * Purpose:     Request DTOs for the admin broker exchange config API.
 *
 * Exports:
 *   - SetExchangeAccessDto      — body for PUT /brokers/:id/exchanges/:code
 *   - BulkSetExchangesDto       — body for POST /brokers/:id/exchanges/bulk
 *   - BulkExchangeEntryDto      — item within BulkSetExchangesDto
 *
 * Depends on:
 *   - class-validator — decorators
 *   - class-transformer — Transform/Type
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - GlobalValidationPipe enforces whitelist; extra fields are rejected
 *
 * Read order:
 *   1. SetExchangeAccessDto
 *   2. BulkSetExchangesDto
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
 */

import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SetExchangeAccessDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  connectorFamily?: string;
}

export class BulkExchangeEntryDto {
  @IsString()
  @MaxLength(16)
  exchangeCode!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  connectorFamily?: string;
}

export class BulkSetExchangesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkExchangeEntryDto)
  exchanges!: BulkExchangeEntryDto[];
}
