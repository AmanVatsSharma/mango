/**
 * @file src/modules/rbac/dto/create-permission.dto.ts
 * @module rbac
 * @description DTO for creating a permission
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
