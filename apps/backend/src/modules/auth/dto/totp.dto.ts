/**
 * @file src/modules/auth/dto/totp.dto.ts
 * @module auth
 * @description DTOs for TOTP enable/verify/disable
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsString, MaxLength } from 'class-validator';

export class TotpEnableDto {
  @IsString()
  @MaxLength(64)
  issuer!: string; // e.g., Obsidian

  @IsString()
  @MaxLength(64)
  accountName!: string; // e.g., +911234567890
}

export class TotpVerifyDto {
  @IsString()
  @MaxLength(10)
  code!: string;
}
