/**
 * @file src/modules/oms/dtos/admin-leverage.dto.ts
 * @module oms
 * @description DTOs for admin user leverage overrides CRUD
 * @author BharatERP
 * @created 2025-09-25
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpsertUserLeverageOverrideDto {
  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @Length(1, 64)
  userId!: string;

  @ApiProperty({ enum: ['EQUITY', 'FNO', 'FOREX', 'CRYPTO'] })
  @IsIn(['EQUITY', 'FNO', 'FOREX', 'CRYPTO'])
  segment!: 'EQUITY' | 'FNO' | 'FOREX' | 'CRYPTO';

  @ApiProperty({ enum: ['INTRADAY', 'DELIVERY', 'SHORT', 'LONG'] })
  @IsIn(['INTRADAY', 'DELIVERY', 'SHORT', 'LONG'])
  positionType!: 'INTRADAY' | 'DELIVERY' | 'SHORT' | 'LONG';

  @ApiProperty({ description: 'Leverage multiplier (e.g., 50x => 50.0)', pattern: '^\\d{1,9}(\\.\\d{1,8})?$' })
  @IsString()
  @Matches(/^\d{1,9}(\.\d{1,8})?$/)
  leverageMultiplier!: string;

  @ApiPropertyOptional({ description: 'ISO date string when override becomes active' })
  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date string when override ends' })
  @IsOptional()
  @IsISO8601()
  validTo?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
