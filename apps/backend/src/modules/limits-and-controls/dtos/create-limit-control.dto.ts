/**
 * @file src/modules/limits-and-controls/dtos/create-limit-control.dto.ts
 * @module limits-and-controls
 * @description DTOs for limit-control and exception queue operations
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateLimitControlDto {
  @Field(() => String)
  @IsUUID()
  tenantId!: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  controlType!: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  scopeType!: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  scopeValue!: string;

  @Field(() => String)
  @Matches(/^\d+(\.\d+)?$/)
  threshold!: string;

  @Field(() => Boolean)
  @IsBoolean()
  enabled!: boolean;
}

@InputType()
export class CreateLimitExceptionDto {
  @Field(() => String)
  @IsUUID()
  tenantId!: string;

  @Field(() => String)
  @IsUUID()
  limitControlId!: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @Field(() => String, { nullable: true })
  @IsObject()
  metadata?: string | null;
}
