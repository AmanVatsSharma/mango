/**
 * @file src/modules/market/dto/instruments.dto.ts
 * @module market
 * @description DTOs for instrument queries
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListInstrumentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  exchange?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  q?: string;
}
