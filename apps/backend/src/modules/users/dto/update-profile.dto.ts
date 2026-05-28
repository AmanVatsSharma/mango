/**
 * @file src/modules/users/dto/update-profile.dto.ts
 * @module users
 * @description DTO for self-service profile updates
 * @author BharatERP
 * @created 2025-01-09
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false, example: 'Aman Sharma' })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @ApiProperty({ required: false, example: 'IN' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @ApiProperty({ required: false, example: 'US' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  taxResidencyCountry?: string;

  @ApiProperty({ required: false, example: { line1: 'Street', city: 'Mumbai', pin: '400001' } })
  @IsOptional()
  address?: Record<string, unknown>;

  @ApiProperty({ required: false, example: { theme: 'dark' } })
  @IsOptional()
  preferences?: Record<string, unknown>;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;

  @ApiProperty({ required: false, example: 'REFERRED123' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  referralSource?: string;
}

