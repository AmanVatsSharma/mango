/**
 * @file src/modules/settlement/dtos/create-settlement-job.dto.ts
 * @module settlement
 * @description DTO for settlement job creation scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsDateString, IsIn, IsUUID, Matches } from 'class-validator';

export class CreateSettlementJobDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  accountId!: string;

  @IsDateString()
  tradeDate!: string;

  @Matches(/^\d+(\.\d+)?$/)
  amount!: string;

  @IsIn(['USD', 'INR', 'EUR', 'AED', 'GBP'])
  currency!: 'USD' | 'INR' | 'EUR' | 'AED' | 'GBP';
}
