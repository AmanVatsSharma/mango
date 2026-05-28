/**
 * File:        apps/backend/src/modules/pamm/controllers/pamm.controller.ts
 * Module:      pamm
 * Purpose:     Admin REST endpoints for PAMM (Percentage Allocation Management Module)
 *
 * Exports:
 *   - PamMController — @Controller('admin/pamm')
 *       GET    /admin/pamm/masters          — list PAMM masters
 *       POST   /admin/pamm/masters          — create PAMM master
 *       GET    /admin/pamm/slaves           — list slave allocations
 *       POST   /admin/pamm/allocations      — create/update allocation
 *
 * Depends on:
 *   - PammService — PAMM CRUD
 *
 * Side-effects:
 *   - DB writes via service
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard + PermissionsGuard('oms:admin')
 *
 * Read order:
 *   1. PamMController — all endpoints
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { PammService } from '../services/pamm.service';
import { CreatePamMMasterDto } from '../dtos/create-pamm-master.dto';
import { CreatePamMAllocationDto } from '../dtos/create-pamm-allocation.dto';
import { PamMMasterEntity } from '../entities/pamm-master.entity';
import { PamMSlaveEntity } from '../entities/pamm-slave.entity';

@Controller('admin/pamm')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class PamMController {
  constructor(private readonly pammService: PammService) {}

  @Get('masters')
  @Permissions('oms:admin')
  async listMasters(@Tenant() tenantId: string): Promise<PamMMasterEntity[]> {
    return this.pammService.listMasters(tenantId);
  }

  @Post('masters')
  @Permissions('oms:admin')
  async createMaster(@Body() dto: CreatePamMMasterDto): Promise<PamMMasterEntity> {
    return this.pammService.createMaster(dto);
  }

  @Get('slaves')
  @Permissions('oms:admin')
  async listSlaves(@Tenant() tenantId: string): Promise<PamMSlaveEntity[]> {
    return this.pammService.listSlaves(tenantId);
  }

  @Post('allocations')
  @Permissions('oms:admin')
  async createAllocation(@Body() dto: CreatePamMAllocationDto): Promise<PamMSlaveEntity> {
    return this.pammService.createOrUpdateAllocation(dto);
  }
}