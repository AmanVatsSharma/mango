/**
 * File:        apps/backend/src/modules/crm/dtos/create-crm-outreach.dto.ts
 * Module:      crm
 * Purpose:     DTO for sending CRM outreach communication
 *
 * Exports:
 *   - CreateCrmOutreachDto — outreach creation payload
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
 *   1. CreateCrmOutreachDto — field definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCrmOutreachDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsOptional()
  message?: string;
}