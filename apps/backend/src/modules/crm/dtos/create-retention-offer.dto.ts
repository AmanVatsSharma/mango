/**
 * File:        apps/backend/src/modules/crm/dtos/create-retention-offer.dto.ts
 * Module:      crm
 * Purpose:     DTO for creating a retention offer
 *
 * Exports:
 *   - CreateRetentionOfferDto — retention offer payload
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
 *   1. CreateRetentionOfferDto — field definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateRetentionOfferDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  offerType!: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  value?: number;
}