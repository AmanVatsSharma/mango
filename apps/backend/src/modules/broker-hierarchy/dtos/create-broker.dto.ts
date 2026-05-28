/**
 * @file src/modules/broker-hierarchy/dtos/create-broker.dto.ts
 * @module broker-hierarchy
 * @description DTO for broker node creation
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';

export class CreateBrokerDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 128)
  brokerCode!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 255)
  displayName!: string;
}
