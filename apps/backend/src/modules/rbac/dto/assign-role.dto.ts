/**
 * @file src/modules/rbac/dto/assign-role.dto.ts
 * @module rbac
 * @description DTO for assigning a role to a user
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsUUID } from 'class-validator';

export class AssignRoleDto {
  @IsUUID()
  userId!: string;
}
