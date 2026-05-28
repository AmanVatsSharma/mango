/**
 * @file src/modules/compliance/dtos/upsert-compliance-policy.dto.ts
 * @module compliance
 * @description DTO for tenant compliance policy upsert requests
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsIn, IsInt, IsNotEmpty, IsObject, IsString, IsUUID, Min } from 'class-validator';
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class UpsertCompliancePolicyDto {
  @Field(() => String)
  @IsUUID()
  tenantId!: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  jurisdictionCode!: string;

  @Field(() => String)
  @IsIn(['BASIC', 'ENHANCED', 'INSTITUTIONAL'])
  kycTier!: 'BASIC' | 'ENHANCED' | 'INSTITUTIONAL';

  @Field(() => String)
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  amlRiskLevel!: 'LOW' | 'MEDIUM' | 'HIGH';

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  sanctionsProvider!: string;

  @Field(() => String, { nullable: true })
  @IsObject()
  suitabilityRules?: string | null;

  @Field(() => Number)
  @IsInt()
  @Min(365)
  auditRetentionDays!: number;
}