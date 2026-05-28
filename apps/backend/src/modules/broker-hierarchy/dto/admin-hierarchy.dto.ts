/**
 * File:        apps/backend/src/modules/broker-hierarchy/dto/admin-hierarchy.dto.ts
 * Module:      broker-hierarchy
 * Purpose:     DTOs for admin hierarchy endpoints — IB listing, client group CRUD.
 *
 * Exports:
 *   - AdminListIbsQueryDto    — GET /admin/ibs query params (pagination)
 *   - CreateClientGroupDto    — POST /admin/client-groups body
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. AdminListIbsQueryDto — query shape
 *   2. CreateClientGroupDto — mutation shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdminListIbsQueryDto {
  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  offset?: string;
}

export class CreateClientGroupDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  brokerId!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}