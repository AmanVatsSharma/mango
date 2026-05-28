/**
 * @file src/modules/broker-hierarchy/dtos/create-desk.dto.ts
 * @module broker-hierarchy
 * @description DTO for creating desk nodes under branches
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';

export class CreateDeskDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 128)
  deskCode!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 255)
  displayName!: string;
}
