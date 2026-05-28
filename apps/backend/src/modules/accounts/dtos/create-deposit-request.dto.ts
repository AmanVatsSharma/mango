/**
 * @file src/modules/accounts/dtos/create-deposit-request.dto.ts
 * @module accounts
 * @description DTO for creating a deposit request prior to admin approval
 * @author BharatERP
 * @created 2025-01-09
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateDepositRequestDto {
  @ApiProperty({ example: 'acc-uuid' })
  @IsString()
  @MaxLength(64)
  accountId!: string;

  @ApiProperty({ example: '10000.00' })
  @IsString()
  @Matches(/^\d{1,20}(\.\d{1,8})?$/)
  amount!: string;

  @ApiProperty({ example: 'INR' })
  @IsString()
  @Length(3, 8)
  currency!: string;

  @ApiProperty({
    example: 'dep-2025-01-001',
    description: 'External reference for idempotency (per tenant)',
  })
  @IsString()
  @Length(3, 128)
  externalRefId!: string;

  @ApiProperty({ required: false, example: 'UTR1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  referenceNote?: string;

  @ApiProperty({ required: false, example: 'https://proof.example.com/utr123' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  proofUrl?: string;
}

