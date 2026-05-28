/**
 * File:        apps/backend/src/modules/tenancy/dtos/upsert-brand-config.dto.ts
 * Module:      tenancy
 * Purpose:     DTO for creating or updating a tenant's white-label brand config.
 *
 * Exports:
 *   - UpsertBrandConfigDto — validated input for brand config upsert
 *
 * Depends on:  class-validator
 * Side-effects: none
 * Key invariants: all fields optional; partial updates are safe (merge semantics in service)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-11
 */

import { IsHexColor, IsObject, IsOptional, IsString, IsUrl, IsPhoneNumber } from 'class-validator';

export class UpsertBrandConfigDto {
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsUrl()
  faviconUrl?: string;

  @IsOptional()
  @IsString()
  appName?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsString()
  customDomain?: string;

  @IsOptional()
  @IsString()
  supportEmail?: string;

  @IsOptional()
  @IsString()
  supportPhone?: string;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;
}
