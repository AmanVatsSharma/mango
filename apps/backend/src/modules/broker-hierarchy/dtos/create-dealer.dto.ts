/**
 * @file src/modules/broker-hierarchy/dtos/create-dealer.dto.ts
 * @module broker-hierarchy
 * @description DTO for creating dealer mappings under desks
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsIn, IsUUID } from 'class-validator';

export class CreateDealerDto {
  @IsUUID()
  deskId!: string;

  @IsUUID()
  userId!: string;

  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';
}
