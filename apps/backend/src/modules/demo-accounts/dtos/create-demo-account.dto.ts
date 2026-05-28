/**
 * @file src/modules/demo-accounts/dtos/create-demo-account.dto.ts
 * @module demo-accounts
 * @description DTO for creating a demo account with optional virtual balance seed
 * @author BharatERP
 * @created 2026-03-15
 */

import { IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDemoAccountDto {
  @IsOptional()
  @IsString()
  @Length(3, 8)
  baseCurrency?: string;

  @IsOptional()
  @IsString()
  @Length(3, 8)
  seedBalanceCcy?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  seedAmount?: number;
}
