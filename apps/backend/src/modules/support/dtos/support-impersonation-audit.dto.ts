/**
 * @file src/modules/support/dtos/support-impersonation-audit.dto.ts
 * @module support
 * @description DTO for support impersonation audit hooks
 * @author BharatERP
 * @created 2026-02-19
 */

import { IsString, MaxLength, MinLength } from 'class-validator';

export class SupportImpersonationAuditDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  actorUserId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(64)
  targetUserId!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(256)
  reason!: string;
}
