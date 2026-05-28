/**
 * @file src/modules/broker-hierarchy/dtos/assign-hierarchy-role.dto.ts
 * @module broker-hierarchy
 * @description DTO for hierarchy-level role delegation
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsBoolean, IsIn, IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';
import { HierarchyPrincipalType } from '../entities/hierarchy-role-mapping.entity';

export class AssignHierarchyRoleDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['PLATFORM_OWNER', 'BROKER_ADMIN', 'DEALER'])
  principalType!: HierarchyPrincipalType;

  @IsUUID()
  principalId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 64)
  roleCode!: string;

  @IsBoolean()
  delegated!: boolean;
}
