/**
 * @file src/modules/users/dto/verify-mobile.dto.ts
 * @module users
 * @description DTOs for mobile verification request and confirmation
 * @author BharatERP
 * @created 2025-01-09
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class RequestMobileVerificationDto {
  @ApiProperty({ example: '+911234567890' })
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/)
  mobileE164!: string;
}

export class ConfirmMobileVerificationDto {
  @ApiProperty({ example: '+911234567890' })
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/)
  mobileE164!: string;

  @ApiProperty({ example: '000000' })
  @IsString()
  @Matches(/^\d{6}$/)
  @Length(6, 6)
  code!: string;
}

