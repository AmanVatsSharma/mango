/**
 * File:        apps/backend/src/modules/lp-routing/dtos/update-lp-provider.dto.ts
 * Module:      lp-routing
 * Purpose:     DTO for updating an LP provider
 *
 * Exports:
 *   - UpdateLpProviderDto — update payload
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
 *   1. UpdateLpProviderDto — field definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateLpProviderDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

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

  @IsOptional()
  config?: Record<string, unknown>;
}