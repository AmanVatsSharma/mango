/**
 * File:        apps/backend/src/modules/rbac/dto/admin-team.dto.ts
 * Module:      rbac
 * Purpose:     DTOs for admin team member management — listing, creation, and patch.
 *
 * Exports:
 *   - AdminListTeamMembersQueryDto  — GET /admin/team-members query params
 *   - CreateTeamMemberDto           — POST /admin/team-members body
 *   - UpdateTeamMemberDto           — PATCH /admin/team-members/:id body
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - roleNames is an array of existing role names; UserRoleEntity links user to each
 *
 * Read order:
 *   1. AdminListTeamMembersQueryDto — list query
 *   2. CreateTeamMemberDto         — creation payload
 *   3. UpdateTeamMemberDto          — patch payload
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdminListTeamMembersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class CreateTeamMemberDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MaxLength(64)
  mobileE164!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsArray()
  roleNames!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  password?: string;
}

export class UpdateTeamMemberDto {
  @IsOptional()
  @IsArray()
  roleNames?: string[];

  @IsOptional()
  @IsIn(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive';
}