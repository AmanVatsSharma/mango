/**
 * @file src/modules/accounts/dtos/get-balances.dto.ts
 * @module accounts
 * @description DTO for balances query
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsOptional, IsString, Length } from 'class-validator';

export class GetBalancesDto {
  @IsOptional()
  @IsString()
  @Length(3, 8)
  currency?: string; // desired currency; if different, FX will convert
}
