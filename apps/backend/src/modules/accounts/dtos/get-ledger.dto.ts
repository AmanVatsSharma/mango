/**
 * @file src/modules/accounts/dtos/get-ledger.dto.ts
 * @module accounts
 * @description DTO for ledger query with pagination and filters
 * @author BharatERP
 * @created 2025-09-19
 */

import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class GetLedgerDto {
  @IsOptional()
  @IsString()
  from?: string; // ISO date

  @IsOptional()
  @IsString()
  to?: string; // ISO date

  @IsOptional()
  @IsString()
  @Length(1, 128)
  externalRefId?: string;

  @IsOptional()
  @IsIn([
    'deposit',
    'withdrawal',
    'fee',
    'adjustment',
    'trade',
    'settlement',
    'hold',
    'release',
  ])
  kind?:
    | 'deposit'
    | 'withdrawal'
    | 'fee'
    | 'adjustment'
    | 'trade'
    | 'settlement'
    | 'hold'
    | 'release';

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
