/**
 * @file src/modules/corporate-actions/dtos/create-corporate-action.dto.ts
 * @module corporate-actions
 * @description DTO for corporate action event creation
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsDateString, IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCorporateActionDto {
  @IsUUID()
  tenantId!: string;

  @IsIn(['DIVIDEND', 'SPLIT', 'BONUS', 'MERGER', 'DELISTING'])
  actionType!: 'DIVIDEND' | 'SPLIT' | 'BONUS' | 'MERGER' | 'DELISTING';

  @IsString()
  instrumentId!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
