/**
 * @file src/modules/accounts/dtos/cash-hold-release.dto.ts
 * @module accounts
 * @description DTO for creating and releasing cash holds
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CashHoldDto {
  @IsString()
  @Matches(/^\d{1,20}(\.\d{1,8})?$/)
  amount!: string;

  @IsString()
  @Length(3, 8)
  currency!: string;

  @IsIn(['ORDER', 'MARGIN', 'WITHDRAWAL'])
  reason!: 'ORDER' | 'MARGIN' | 'WITHDRAWAL';

  @IsString()
  @Length(1, 128)
  externalRefId!: string;

  @IsOptional()
  meta?: Record<string, unknown>;
}

export class CashReleaseDto {
  @IsString()
  @Length(1, 128)
  externalRefId!: string; // same ref used for hold

  @IsOptional()
  meta?: Record<string, unknown>;
}
