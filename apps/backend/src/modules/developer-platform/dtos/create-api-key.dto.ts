/**
 * @file src/modules/developer-platform/dtos/create-api-key.dto.ts
 * @module developer-platform
 * @description DTO for API key creation
 * @author BharatERP
 * @created 2026-02-19
 */

import { IsArray, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateApiKeyDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  appId!: string;

  @IsString()
  keyPrefix!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsArray()
  @IsString({ each: true })
  scopes!: string[];
}
