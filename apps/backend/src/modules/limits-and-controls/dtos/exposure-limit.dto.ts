/**
 * File:        apps/backend/src/modules/limits-and-controls/dtos/exposure-limit.dto.ts
 * Module:      limits-and-controls
 * Purpose:     DTOs for exposure limit CRUD via admin endpoints.
 *
 * Exports:
 *   - CreateExposureLimitDto    — POST /admin/limits/exposure
 *   - UpdateExposureLimitDto   — PATCH /admin/limits/exposure/:id
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - alertThreshold must be < 1.0 (fraction of hard limit)
 *   - hardLimit must be >= maxNetExposure
 *
 * Read order:
 *   1. CreateExposureLimitDto — creation payload
 *   2. UpdateExposureLimitDto  — patch payload
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateExposureLimitDto {
  @Field(() => String)
  @IsUUID()
  tenantId!: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  instrumentId!: string;

  @Field(() => Number)
  @IsNumber()
  @Min(0)
  maxNetExposure!: number;

  @Field(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  alertThreshold!: number;

  @Field(() => Number)
  @IsNumber()
  @Min(0)
  hardLimit!: number;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

@InputType()
export class UpdateExposureLimitDto {
  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxNetExposure?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  alertThreshold?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hardLimit?: number;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}