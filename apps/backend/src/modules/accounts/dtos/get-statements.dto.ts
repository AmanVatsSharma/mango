/**
 * @file src/modules/accounts/dtos/get-statements.dto.ts
 * @module accounts
 * @description DTO for daily statements range query
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsOptional, IsString } from 'class-validator';

export class GetStatementsDto {
  @IsOptional()
  @IsString()
  from?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  to?: string; // YYYY-MM-DD
}
