/**
 * @file src/modules/rbac/dto/update-role.dto.ts
 * @module rbac
 * @description DTO for updating a role
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  newName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
