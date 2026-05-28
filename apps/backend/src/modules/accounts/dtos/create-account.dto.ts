/**
 * @file src/modules/accounts/dtos/create-account.dto.ts
 * @module accounts
 * @description DTO for creating a trading account
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { InputType } from '@nestjs/graphql';

@InputType()
export class CreateAccountDto {
  @IsString()
  @Length(1, 64)
  userId!: string;

  @IsString()
  @Length(3, 8)
  baseCurrency!: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';

  @IsOptional()
  @IsString()
  @IsIn(['LIVE', 'DEMO'])
  accountType?: 'LIVE' | 'DEMO';
}
