/**
 * File:        apps/backend/src/modules/market/dto/admin-instruments.dto.ts
 * Module:      market
 * Purpose:     DTOs for the admin instruments REST endpoint — status filter, asset class
 *              filter, symbol search, and instrument patch.
 *
 * Exports:
 *   - AdminListInstrumentsQueryDto  — GET /admin/instruments query params
 *   - UpdateInstrumentDto           — PATCH /admin/instruments/:id body
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - status filter maps to InstrumentEntity.status (Active|Disabled|Halted)
 *
 * Read order:
 *   1. AdminListInstrumentsQueryDto — query shape
 *   2. UpdateInstrumentDto          — mutation shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminListInstrumentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  exchange?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  q?: string;

  @IsOptional()
  @IsIn(['Active', 'Disabled', 'Halted'])
  status?: 'Active' | 'Disabled' | 'Halted';

  @IsOptional()
  @IsString()
  @MaxLength(16)
  assetClass?: string;
}

export class UpdateInstrumentDto {
  @IsOptional()
  @IsIn(['Active', 'Disabled', 'Halted'])
  status?: 'Active' | 'Disabled' | 'Halted';
}