/**
 * @file src/modules/auth/dto/verify-otp.dto.ts
 * @module auth
 * @description DTO to verify login OTP and issue tokens
 * @author BharatERP
 * @created 2025-09-18
 */

import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/)
  mobileE164!: string;

  @IsString()
  @MaxLength(10)
  otp!: string;

  @IsString()
  @MaxLength(64)
  deviceInfo!: string;

  // Optional for users with TOTP enabled; kept to satisfy whitelist validation
  @IsOptional()
  @IsString()
  @MaxLength(10)
  totpCode?: string;
}
