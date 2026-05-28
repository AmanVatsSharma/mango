/**
 * @file src/modules/rbac/dto/update-permission.dto.ts
 * @module rbac
 * @description DTO for updating a permission
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePermissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  newName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
