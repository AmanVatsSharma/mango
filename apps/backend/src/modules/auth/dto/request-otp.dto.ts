/**
 * @file src/modules/auth/dto/request-otp.dto.ts
 * @module auth
 * @description DTO to request login OTP via SMS
 * @author BharatERP
 * @created 2025-09-18
 */

import { IsString, Matches, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @MaxLength(64)
  tenantId!: string; // from X-Tenant-Id ideally; still requiring for DTO clarity

  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/)
  mobileE164!: string;
}
