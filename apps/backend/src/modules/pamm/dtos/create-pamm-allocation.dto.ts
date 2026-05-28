/**
 * File:        apps/backend/src/modules/pamm/dtos/create-pamm-allocation.dto.ts
 * Module:      pamm
 * Purpose:     DTO for creating or updating a PAMM slave allocation
 *
 * Exports:
 *   - CreatePamMAllocationDto — allocation payload
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
 *   1. CreatePamMAllocationDto — field definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsNotEmpty, IsNumber, IsUUID, Max, Min } from 'class-validator';

export class CreatePamMAllocationDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  masterId!: string;

  @IsUUID()
  userId!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  allocationPct!: number;
}