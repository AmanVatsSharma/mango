/**
 * @file src/modules/broker-hierarchy/dtos/create-branch.dto.ts
 * @module broker-hierarchy
 * @description DTO for branch creation under broker hierarchy
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsNotEmpty, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateBranchDto {
  @IsUUID()
  brokerId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 128)
  branchCode!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 255)
  displayName!: string;

  @IsString()
  @Matches(/^[A-Z]{2,3}$/)
  countryCode!: string;
}
