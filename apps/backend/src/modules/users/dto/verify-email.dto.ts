/**
 * @file src/modules/users/dto/verify-email.dto.ts
 * @module users
 * @description DTOs for email verification request and confirmation
 * @author BharatERP
 * @created 2025-01-09
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class RequestEmailVerificationDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;
}

export class ConfirmEmailVerificationDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '000000' })
  @IsString()
  @Matches(/^\d{6}$/)
  @Length(6, 6)
  code!: string;
}

