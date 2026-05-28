/**
 * @file src/modules/tenancy/dtos/create-legal-entity.dto.ts
 * @module tenancy
 * @description DTO for creating legal entities under tenants
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsNotEmpty, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateLegalEntityDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 255)
  legalName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 64)
  registrationNumber!: string;

  @IsString()
  @Matches(/^[A-Z]{2,3}$/)
  countryCode!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 16)
  type!: string;
}
