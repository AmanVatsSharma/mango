/**
 * @file src/modules/oms/dtos/admin-brokerage.dto.ts
 * @module oms
 * @description DTOs for admin brokerage rules CRUD
 * @author BharatERP
 * @created 2025-09-25
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpsertBrokerageRuleDto {
  @ApiProperty({ enum: ['TENANT', 'USER'] })
  @IsIn(['TENANT', 'USER'])
  appliesTo!: 'TENANT' | 'USER';

  @ApiPropertyOptional({ minLength: 1, maxLength: 64 })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  userId?: string;

  @ApiProperty({ enum: ['EQUITY', 'FNO', 'FOREX', 'CRYPTO'] })
  @IsIn(['EQUITY', 'FNO', 'FOREX', 'CRYPTO'])
  segment!: 'EQUITY' | 'FNO' | 'FOREX' | 'CRYPTO';

  @ApiProperty({ enum: ['CASH', 'FUTURES', 'OPTIONS'] })
  @IsIn(['CASH', 'FUTURES', 'OPTIONS'])
  product!: 'CASH' | 'FUTURES' | 'OPTIONS';

  @ApiProperty({ enum: ['BUY', 'SELL', 'BOTH'], default: 'BOTH' })
  @IsIn(['BUY', 'SELL', 'BOTH'])
  side!: 'BUY' | 'SELL' | 'BOTH';

  @ApiProperty({ pattern: '^\\d{1,9}(\\.\\d{1,8})?$', description: 'Percent as decimal, e.g., 0.001 for 0.1%' })
  @IsString()
  @Matches(/^\d{1,9}(\.\d{1,8})?$/)
  percent!: string;

  @ApiProperty({ pattern: '^\\d{1,9}(\\.\\d{1,8})?$' })
  @IsString()
  @Matches(/^\d{1,9}(\.\d{1,8})?$/)
  perOrderFlat!: string;

  @ApiPropertyOptional({ pattern: '^\\d{1,9}(\\.\\d{1,8})?$' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,9}(\.\d{1,8})?$/)
  capPerOrder?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}


