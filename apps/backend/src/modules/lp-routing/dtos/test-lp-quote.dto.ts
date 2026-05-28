/**
 * File:        apps/backend/src/modules/lp-routing/dtos/test-lp-quote.dto.ts
 * Module:      lp-routing
 * Purpose:     DTO for testing an LP quote request
 *
 * Exports:
 *   - TestLpQuoteDto — test quote payload
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
 *   1. TestLpQuoteDto — field definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class TestLpQuoteDto {
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsString()
  @IsNotEmpty()
  side!: string;

  @IsNumber()
  quantity!: number;

  @IsString()
  @IsOptional()
  lpProviderId?: string;
}