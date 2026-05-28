/**
 * File:        apps/backend/src/modules/pamm/dtos/create-pamm-master.dto.ts
 * Module:      pamm
 * Purpose:     DTO for creating a PAMM master strategy
 *
 * Exports:
 *   - CreatePamMMasterDto — creation payload
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
 *   1. CreatePamMMasterDto — field definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreatePamMMasterDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  strategyDescription?: string;

  @IsNumber()
  @Min(0)
  minAllocation!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  performanceFee!: number;
}