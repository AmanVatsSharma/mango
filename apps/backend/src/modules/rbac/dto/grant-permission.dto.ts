/**
 * @file src/modules/rbac/dto/grant-permission.dto.ts
 * @module rbac
 * @description DTO for granting a permission to a role
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsString, MaxLength } from 'class-validator';

export class GrantPermissionDto {
  @IsString()
  @MaxLength(64)
  permissionName!: string;
}
