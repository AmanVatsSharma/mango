/**
 * @file src/modules/users/dto/update-user.dto.ts
 * @module users
 * @description DTO for updating a user
 * @author BharatERP
 * @created 2025-09-18
 */

import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsBoolean()
  isMobileVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  isEmailVerified?: boolean;

  @IsOptional()
  profile?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected'])
  kycStatus?: 'pending' | 'verified' | 'rejected';
}
