/**
 * File:        apps/backend/src/modules/promotions/dtos/update-promotion.dto.ts
 * Module:      promotions
 * Purpose:     DTO for updating a promotion
 *
 * Exports:
 *   - UpdatePromotionDto — update payload
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
 *   1. UpdatePromotionDto — field definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdatePromotionDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  budget?: number;
}