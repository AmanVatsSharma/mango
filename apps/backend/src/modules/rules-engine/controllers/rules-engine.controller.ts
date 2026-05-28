/**
 * File:        apps/backend/src/modules/rules-engine/controllers/rules-engine.controller.ts
 * Module:      rules-engine
 * Purpose:     Broker admin REST endpoints for automation rule management.
 *
 * Exports:
 *   - RulesEngineController — @Controller('admin/rules')
 *       GET    /admin/rules           — list all rules for tenant
 *       POST   /admin/rules           — create a rule
 *       GET    /admin/rules/:id        — get one rule
 *       PATCH  /admin/rules/:id        — update a rule
 *       DELETE /admin/rules/:id        — delete a rule
 *       POST   /admin/rules/:id/toggle — activate or deactivate a rule
 *
 * Depends on:
 *   - RulesEngineService — CRUD and toggle
 *
 * Side-effects: DB writes for POST, PATCH, DELETE, POST toggle
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard + PermissionsGuard('oms:admin')
 *   - TenantGuard extracts tenantId from authenticated JWT context
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { Tenant } from '../../rbac/decorators/tenant.decorator';
import { RulesEngineService } from '../services/rules-engine.service';
import { CreateRuleDto, UpdateRuleDto } from '../dtos/rule.dto';

@ApiTags('admin/rules')
@Controller('admin/rules')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Permissions('oms:admin')
@ApiBearerAuth('JWT')
export class RulesEngineController {
  constructor(private readonly rulesEngine: RulesEngineService) {}

  @Get()
  @ApiOperation({ summary: 'List all automation rules for the tenant' })
  async list(@Tenant() tenantId: string) {
    return this.rulesEngine.listRules(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new automation rule' })
  async create(@Body() dto: CreateRuleDto, @Tenant() tenantId: string) {
    return this.rulesEngine.createRule(dto, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single rule by ID' })
  async get(@Param('id') id: string, @Tenant() tenantId: string) {
    return this.rulesEngine.listRules(tenantId).then(
      rules => rules.find(r => r.id === id) ?? Promise.reject(new Error('Rule not found')),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing rule' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
    @Tenant() tenantId: string,
  ) {
    return this.rulesEngine.updateRule(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a rule' })
  async delete(@Param('id') id: string, @Tenant() tenantId: string) {
    await this.rulesEngine.deleteRule(id, tenantId);
    return { deleted: true, id };
  }

  @Post(':id/toggle')
  @ApiOperation({ summary: 'Activate or deactivate a rule' })
  async toggle(@Param('id') id: string, @Tenant() tenantId: string) {
    return this.rulesEngine.toggleRule(id, tenantId);
  }
}
