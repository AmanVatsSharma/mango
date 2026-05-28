/**
 * @file src/modules/reconciliation/dtos/create-reconciliation-break.dto.ts
 * @module reconciliation
 * @description DTO for reconciliation break creation
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsNotEmpty, IsObject, IsString, IsUUID, Length } from 'class-validator';

export class CreateReconciliationBreakDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 64)
  breakType!: string;

  @IsString()
  @IsNotEmpty()
  @Length(5, 255)
  description!: string;

  @IsObject()
  metadata!: Record<string, unknown>;
}
