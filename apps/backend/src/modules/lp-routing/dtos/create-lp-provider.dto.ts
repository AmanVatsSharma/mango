/**
 * File:        apps/backend/src/modules/lp-routing/dtos/create-lp-provider.dto.ts
 * Module:      lp-routing
 * Purpose:     DTO for creating an LP provider
 *
 * Exports:
 *   - CreateLpProviderDto — creation payload
 *
 * Depends on:
 *   - none
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. CreateLpProviderDto — field definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateLpProviderDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsOptional()
  apiEndpoint?: string;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsNumber()
  @Min(1)
  @IsOptional()
  priority?: number;
}