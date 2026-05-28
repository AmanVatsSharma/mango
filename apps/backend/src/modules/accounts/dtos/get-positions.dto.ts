/**
 * @file src/modules/accounts/dtos/get-positions.dto.ts
 * @module accounts
 * @description DTO for positions query
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsOptional, IsString, Length } from 'class-validator';

export class GetPositionsDto {
  @IsOptional()
  @IsString()
  @Length(3, 8)
  currency?: string;
}
