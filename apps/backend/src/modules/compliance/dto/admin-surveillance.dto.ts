/**
 * File:        apps/backend/src/modules/compliance/dto/admin-surveillance.dto.ts
 * Module:      compliance
 * Purpose:     DTOs for admin surveillance operations — dismiss and acknowledge.
 *
 * Exports:
 *   - DismissSurveillanceAlertDto — PATCH body for dismiss
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - reason is optional; if absent, dismissal is recorded without a reason
 *
 * Read order:
 *   1. DismissSurveillanceAlertDto
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsOptional, IsString } from 'class-validator';

export class DismissSurveillanceAlertDto {
  @IsOptional()
  @IsString()
  reason?: string;
}