/**
 * @file src/modules/support/dtos/create-support-ticket.dto.ts
 * @module support
 * @description DTO for support ticket creation
 * @author BharatERP
 * @created 2026-02-19
 */

import { IsIn, IsObject, IsString, IsUUID, MaxLength } from 'class-validator';
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateSupportTicketDto {
  @Field(() => String)
  @IsUUID()
  tenantId!: string;

  @Field(() => String)
  @IsUUID()
  userId!: string;

  @Field(() => String)
  @IsString()
  @MaxLength(256)
  subject!: string;

  @Field(() => String)
  @IsString()
  description!: string;

  @Field(() => String)
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  priority!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @Field(() => String, { nullable: true })
  @IsObject()
  metadata?: string | null;
}
