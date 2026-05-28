/**
 * @file src/modules/onboarding/dtos/upsert-onboarding-profile.dto.ts
 * @module onboarding
 * @description DTO for onboarding profile upsert requests
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsIn, IsObject, IsString, IsUUID, Matches } from 'class-validator';

export class UpsertOnboardingProfileDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;

  @IsString()
  @Matches(/^[A-Z]{2,3}$/)
  countryCode!: string;

  @IsIn(['BASIC', 'ENHANCED', 'INSTITUTIONAL'])
  kycTier!: 'BASIC' | 'ENHANCED' | 'INSTITUTIONAL';

  @IsIn(['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'])
  status!: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

  @IsObject()
  amlFlags!: Record<string, unknown>;
}
