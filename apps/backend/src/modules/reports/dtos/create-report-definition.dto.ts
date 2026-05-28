/**
 * File:        apps/backend/src/modules/reports/dtos/create-report-definition.dto.ts
 * Module:      reports
 * Purpose:     DTO for creating a report definition
 *
 * Exports:
 *   - CreateReportDefinitionDto — creation payload
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
 *   1. CreateReportDefinitionDto — field definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsArray, IsNotEmpty, IsNotEmptyObject, IsOptional, IsString, IsUUID, IsObject } from 'class-validator';

export class CreateReportDefinitionDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsArray()
  @IsOptional()
  columns?: string[];

  @IsObject()
  @IsOptional()
  @IsNotEmptyObject()
  filters?: Record<string, unknown>;

  @IsUUID()
  createdBy!: string;
}