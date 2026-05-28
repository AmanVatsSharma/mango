/**
 * File:        apps/backend/src/modules/reconciliation/dtos/import-statement.dto.ts
 * Module:      reconciliation
 * Purpose:     DTO shapes for importing an LP daily statement and running reconciliation.
 *
 * Exports:
 *   - LpStatementLineDto     — one trade line from LP daily export
 *   - ImportStatementDto     — wrapper for a full statement import payload
 *   - RunReconciliationDto   — triggers reconciliation for a given tenant + date
 *
 * Depends on:
 *   - class-validator — input validation decorators
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - statementDate is an ISO date string 'YYYY-MM-DD'
 *   - side must be 'BUY' or 'SELL'
 *   - quantity and price are strings to preserve decimal precision across JSON
 *
 * Read order:
 *   1. LpStatementLineDto — single line shape
 *   2. ImportStatementDto — full import payload
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class LpStatementLineDto {
  @IsString()
  @Length(1, 128)
  externalTradeId!: string;

  @IsString()
  @IsOptional()
  @Length(1, 128)
  lpAccountId?: string;

  @IsString()
  @Length(1, 64)
  symbol!: string;

  @IsNumberString()
  quantity!: string;

  @IsNumberString()
  price!: string;

  @IsIn(['BUY', 'SELL'])
  side!: string;
}

export class ImportStatementDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @Matches(DATE_REGEX)
  statementDate!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LpStatementLineDto)
  lines!: LpStatementLineDto[];
}

export class RunReconciliationDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @Matches(DATE_REGEX)
  statementDate!: string;
}
