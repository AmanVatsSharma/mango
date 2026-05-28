/**
 * @file src/modules/dealing/dtos/deal-override.dto.ts
 * @module dealing
 * @description DTO for dealer manual intervention override requests
 * @author BharatERP
 * @created 2026-02-19
 */

import { IsIn, IsString, MaxLength } from 'class-validator';

export class DealOverrideDto {
  @IsIn(['FORCE_REJECT', 'FORCE_CANCEL', 'MANUAL_REPRICE'])
  action!: 'FORCE_REJECT' | 'FORCE_CANCEL' | 'MANUAL_REPRICE';

  @IsString()
  @MaxLength(256)
  reason!: string;
}
