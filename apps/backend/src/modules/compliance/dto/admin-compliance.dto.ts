/**
 * File:        apps/backend/src/modules/compliance/dto/admin-compliance.dto.ts
 * Module:      compliance
 * Purpose:     DTOs for the admin compliance policy endpoint — listing and update.
 *
 * Exports:
 *   - AdminListComplianceConfigQueryDto  — GET /admin/compliance/config query params
 *   - UpdateCompliancePolicyDto          — PUT /admin/compliance/config/:id body
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - UpdateCompliancePolicyDto is a partial update — all fields are optional
 *
 * Read order:
 *   1. AdminListComplianceConfigQueryDto — list query
 *   2. UpdateCompliancePolicyDto         — patch payload
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AdminListComplianceConfigQueryDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class AdminComplianceListQueryDto {
  @IsOptional()
  @IsString()
  jurisdictionCode?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class AdminCompliancePolicyDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  jurisdictionCode!: string;

  @IsString()
  @IsNotEmpty()
  kycTier!: string;

  @IsString()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  amlRiskLevel!: string;

  @IsString()
  @IsNotEmpty()
  sanctionsProvider!: string;

  @IsOptional()
  @IsNumber()
  auditRetentionDays?: number;
}

export class UpdateCompliancePolicyDto {
  @IsOptional()
  @IsIn(['BASIC', 'ENHANCED', 'INSTITUTIONAL'])
  kycTier?: 'BASIC' | 'ENHANCED' | 'INSTITUTIONAL';

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  amlRiskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';

  @IsOptional()
  @IsString()
  sanctionsProvider?: string;

  @IsOptional()
  @IsInt()
  @Min(365)
  auditRetentionDays?: number;
}