/**
 * @file src/modules/accounts/dtos/create-bank-account.dto.ts
 * @module accounts
 * @description DTO for linking a bank account to a user/account with validation rules
 * @author BharatERP
 * @created 2025-01-09
 */

import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({ example: 'Aman Sharma' })
  @IsString()
  @Length(3, 128)
  holderName!: string;

  @ApiProperty({ example: 'HDFC Bank' })
  @IsString()
  @Length(2, 128)
  bankName!: string;

  @ApiProperty({ example: '123456789012' })
  @IsString()
  @Length(6, 32)
  accountNumber!: string;

  @ApiProperty({ example: 'HDFC0001234' })
  @IsString()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
  @Length(11, 11)
  ifscCode!: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiProperty({
    example: 'acc-uuid',
    required: false,
    description: 'Optional trading account to bind this bank account to',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountId?: string;
}

