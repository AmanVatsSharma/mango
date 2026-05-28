/**
 * @file src/modules/tenancy/dtos/create-tenant.dto.ts
 * @module tenancy
 * @description DTO for creating global broker tenants
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 128)
  @Matches(/^[a-z0-9-]+$/)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 255)
  displayName!: string;

  @IsOptional()
  @IsString()
  @Length(2, 64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @Length(2, 64)
  jurisdictionProfile?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'SUSPENDED', 'PENDING'])
  status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
}
