/**
 * @file src/modules/partners/dtos/create-partner.dto.ts
 * @module partners
 * @description DTO for partner creation
 * @author BharatERP
 * @created 2026-02-19
 */

import { IsEmail, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreatePartnerDto {
  @Field(() => String)
  @IsUUID()
  tenantId!: string;

  @Field(() => String)
  @IsString()
  @MaxLength(128)
  name!: string;

  @Field(() => String)
  @IsString()
  @MaxLength(64)
  code!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @Field(() => String, { nullable: true })
  @IsObject()
  metadata?: string | null;
}
