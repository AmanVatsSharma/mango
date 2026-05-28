/**
 * File:        apps/backend/src/modules/promotions/dtos/create-promotion.dto.ts
 * Module:      promotions
 * Purpose:     DTO for creating a promotion
 *
 * Exports:
 *   - CreatePromotionDto — creation payload
 *
 * Depends on:
 *   - none
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - endDate must be >= startDate
 *
 * Read order:
 *   1. CreatePromotionDto — field definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePromotionDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  budget?: number;
}