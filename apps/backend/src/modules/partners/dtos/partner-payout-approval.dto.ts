/**
 * @file src/modules/partners/dtos/partner-payout-approval.dto.ts
 * @module partners
 * @description DTO for partner rebate payout approval hooks
 * @author BharatERP
 * @created 2026-02-19
 */

import { IsNumberString, IsString, MaxLength } from 'class-validator';

export class PartnerPayoutApprovalDto {
  @IsNumberString()
  amount!: string;

  @IsString()
  @MaxLength(8)
  currency!: string;

  @IsString()
  @MaxLength(256)
  reason!: string;
}
